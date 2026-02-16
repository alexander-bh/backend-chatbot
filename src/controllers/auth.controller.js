const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const mongoose = require("mongoose");
const User = require("../models/User");
const Token = require("../models/Token");
const Chatbot = require("../models/Chatbot");
const Account = require("../models/Account");
const Flow = require("../models/Flow");
const FlowNode = require("../models/FlowNode");
const PasswordResetToken = require("../models/PasswordResetToken");
const { generateToken } = require("../utils/jwt");
const { sendResetPasswordEmail } = require("../services/email.service");
const auditService = require("../services/audit.service");
const { sendPasswordChangedAlert } = require("../services/password-alert.service");

const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();


// Utils
const slugify = (text) =>
  text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "");

// Primer registro (crea cuenta + chatbot + flow + flow nodes)
exports.registerFirst = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const {
      account_name,
      name,
      email,
      password,
      onboarding
    } = req.body;

    if (
      !account_name ||
      !name ||
      !email ||
      !password ||
      !onboarding?.phone
    ) {
      throw new Error("Datos obligatorios incompletos");
    }

    if (password.length < 6) {
      throw new Error("La contraseña debe tener al menos 6 caracteres");
    }

    const normalizedEmail = email.toLowerCase().trim();
    const baseSlug = slugify(account_name);
    const slug = `${baseSlug}-${crypto.randomUUID().slice(0, 6)}`;

    const finalPhoneAlt =
      onboarding.phone_alt && onboarding.phone_alt.trim() !== ""
        ? onboarding.phone_alt
        : onboarding.phone;

    const hashedPassword = await bcrypt.hash(password, 10);

    const welcomeText = `Hola 👋 soy el bot de ${name}, ¿en qué puedo ayudarte?`;

    const userExists = await User.findOne({
      email: normalizedEmail
    }).session(session);

    if (userExists) {
      throw new Error("El email ya está registrado");
    }

    const [account] = await Account.create([{
      name: account_name,
      slug,
      plan: "free",
      status: "active"
    }], { session });

    const finalOnboarding = {
      ...onboarding,
      phone: onboarding.phone,
      phone_alt: finalPhoneAlt
    };

    const [user] = await User.create([{
      account_id: account._id,
      name,
      email: normalizedEmail,
      password: hashedPassword,
      role: "CLIENT",
      onboarding: finalOnboarding
    }], { session });

    const chatbot = new Chatbot({
      account_id: account._id,
      name: `Bot de ${name}`,
      public_id: crypto.randomUUID(),
      welcome_message: welcomeText,
      welcome_delay: 2,
      status: "active",
      avatar: process.env.DEFAULT_CHATBOT_AVATAR,
      primary_color: "#2563eb",
      secondary_color: "#111827",
      launcher_text: "¿Te ayudo?",
      position: "bottom-right",
      is_enabled: true,
      input_placeholder: "Escribe tu mensaje…",
      show_branding: true
    })

    await chatbot.save({ session });

    const [flow] = await Flow.create([{
      account_id: account._id,
      chatbot_id: chatbot._id,
      name: "Flujo principal",
      status: "draft",
      version: 1
    }], { session });

    const [startNode] = await FlowNode.create([{
      account_id: account._id,
      flow_id: flow._id,
      node_type: "text",
      content: welcomeText,
      order: 0,
      typing_time: 2,
      is_draft: true
    }], { session });

    flow.start_node_id = startNode._id;
    await flow.save({ session });

    const token = generateToken({
      id: user._id,
      role: user.role,
      account_id: account._id
    });

    await Token.create([{
      user_id: user._id,
      token,
      expires_at: new Date(Date.now() + 86400000)
    }], { session });

    await session.commitTransaction();

    res.status(201).json({
      token,
      account,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    await session.abortTransaction();
    next(error); // 👈 CLAVE
  } finally {
    session.endSession();
  }
};

// Registro de usuario (por subdominio)
exports.register = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!req.account?._id) {
      return res.status(400).json({ message: "Cuenta no resuelta" });
    }

    const accountId = req.account._id;
    const { name, email, password, role = "CLIENT", onboarding } = req.body;

    // ✅ VALIDACIÓN CORRECTA
    if (!name || !email || !password || !onboarding?.phone) {
      return res.status(400).json({
        message: "Datos obligatorios incompletos"
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: "La contraseña debe tener al menos 6 caracteres"
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const userExists = await User.findOne({
      email: normalizedEmail,
      account_id: accountId
    }).session(session);

    if (userExists) {
      return res.status(409).json({
        message: "El email ya está registrado en esta cuenta"
      });
    }

    const finalPhoneAlt =
      onboarding.phone_alt && onboarding.phone_alt.trim() !== ""
        ? onboarding.phone_alt
        : onboarding.phone;

    const hashedPassword = await bcrypt.hash(password, 10);

    const finalOnboarding = {
      ...onboarding,
      phone: onboarding.phone,
      phone_alt: finalPhoneAlt
    };

    const [user] = await User.create([{
      account_id: accountId,
      name,
      email: normalizedEmail,
      password: hashedPassword,
      role,
      onboarding: finalOnboarding
    }], { session });

    await session.commitTransaction();

    res.status(201).json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    });

  } catch (error) {
    await session.abortTransaction();
    console.error("REGISTER ERROR:", error);
    res.status(500).json({ message: "Error al registrar usuario" });
  } finally {
    session.endSession();
  }
};

// Login
exports.login = async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({
    email: email.toLowerCase().trim()
  }).select("+password");

  if (!user) {
    return res.status(401).json({ message: "Credenciales inválidas" });
  }

  if (user.status === "inactive") {
    return res.status(403).json({ message: "Usuario inactivo" });
  }

  const account = await Account.findById(user.account_id);

  if (!account || account.status !== "active") {
    return res.status(403).json({ message: "Cuenta suspendida" });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(401).json({ message: "Credenciales inválidas" });
  }

  const token = generateToken({
    id: user._id,
    role: user.role,
    account_id: account._id
  });

  await Token.create({
    user_id: user._id,
    token,
    expires_at: new Date(Date.now() + 86400000)
  });

  res.json({ token });
};

// Recuperacion de contraseña
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email requerido" });
    }

    const user = await User.findOne({
      email: email.toLowerCase().trim()
    });

    if (!user) {
      return res.json({
        message: "Si el email existe, recibirás un código"
      });
    }

    const recentToken = await PasswordResetToken.findOne({
      user_id: user._id,
      createdAt: { $gt: new Date(Date.now() - 1000 * 60) }
    });

    if (recentToken) {
      return res.status(429).json({
        message: "Espera un minuto antes de solicitar otro código"
      });
    }

    // eliminar códigos previos
    await PasswordResetToken.deleteMany({
      user_id: user._id,
      expires_at: { $lt: new Date() }
    });

    // generar código
    const code = generateOTP(); // ej: 483921
    const hashedCode = await bcrypt.hash(code, 10);

    await PasswordResetToken.create({
      user_id: user._id,
      token: hashedCode,
      expires_at: new Date(Date.now() + 1000 * 60 * 10) // 10 min
    });

    // enviar email
    await sendResetPasswordEmail(user, code);

    return res.json({
      message: "Si el email existe, recibirás un código"
    });

  } catch (error) {
    console.error("FORGOT PASSWORD ERROR:", error);
    res.status(500).json({ message: "Error al solicitar recuperación" });
  }
};

//Resetar la contraseña
exports.resetPassword = async (req, res) => {
  try {
    const { email, code, new_password } = req.body;

    if (!email || !code || !new_password || new_password.length < 6) {
      return res.status(400).json({ message: "Datos inválidos" });
    }

    const user = await User.findOne({
      email: email.toLowerCase().trim()
    }).select("+password");

    if (!user) {
      return res.status(400).json({ message: "Código inválido o expirado" });
    }

    const resetRecord = await PasswordResetToken.findOne({
      user_id: user._id,
      expires_at: { $gt: new Date() }
    });

    if (!resetRecord) {
      return res.status(400).json({ message: "Código inválido o expirado" });
    }

    if (resetRecord.attempts >= 5) {
      return res.status(403).json({
        message: "Demasiados intentos. Solicita un nuevo código."
      });
    }

    const isValid = await bcrypt.compare(code, resetRecord.token);

    if (!isValid) {
      resetRecord.attempts += 1;
      await resetRecord.save();
      return res.status(400).json({ message: "Código incorrecto" });
    }

    user.password = await bcrypt.hash(new_password, 10);
    await user.save();

    await PasswordResetToken.deleteMany({ user_id: user._id });
    await Token.deleteMany({ user_id: user._id });

    res.json({ message: "Contraseña restablecida correctamente" });

  } catch (error) {
    console.error("RESET PASSWORD ERROR:", error);
    res.status(500).json({ message: "Error al restablecer contraseña" });
  }
};

// Cerrar sesion
exports.logout = async (req, res) => {
  try {
    await Token.deleteMany({ user_id: req.user.id });
    res.json({ message: "Sesión cerrada correctamente" });
  } catch (error) {
    console.error("LOGOUT ERROR:", error);
    res.status(500).json({ message: "Error al cerrar sesión" });
  }
};

//Cambio de contraseña
exports.changePassword = async (req, res) => {
  try {
    const { new_password } = req.body;

    if (new_password.length < 6) {
      return res.status(400).json({
        message: "La nueva contraseña debe tener al menos 6 caracteres"
      });
    }

    const user = await User.findById(req.user.id).select("+password");
    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const samePassword = await bcrypt.compare(new_password, user.password);
    if (samePassword) {
      return res.status(400).json({
        message: "La nueva contraseña debe ser diferente a la actual"
      });
    }

    user.password = await bcrypt.hash(new_password, 10);
    await user.save();

    await auditService.log({
      req,
      targetType: "USER",
      targetId: user._id,
      action: "CHANGE_PASSWORD",
      before: null,
      after: null
    });

    try {
      await sendPasswordChangedAlert(user, {
        ip: req.ip,
        device: req.headers["user-agent"]
      });
    } catch (err) {
      console.warn("EMAIL ALERT FAILED:", err.message);
    }


    await Token.deleteMany({ user_id: user._id });

    res.json({
      message: "Contraseña actualizada. Inicia sesión nuevamente."
    });

  } catch (error) {
    console.error("CHANGE PASSWORD ERROR:", error);
    res.status(500).json({
      message: "Error al cambiar contraseña"
    });
  }
};

// Actualizar 
exports.updateProfile = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const user = await User.findById(req.user.id).session(session);
    if (!user) {
      throw new Error("Usuario no encontrado");
    }

    const { name, email, phone, phone_alt } = req.body;

    if (name) user.name = name;

    if (email) {
      const exists = await User.findOne({
        email: email.toLowerCase().trim(),
        _id: { $ne: user._id }
      }).session(session);

      if (exists) {
        throw new Error("Email ya en uso");
      }

      user.email = email.toLowerCase().trim();
    }

    if (phone || phone_alt) {
      user.onboarding ||= {};
      const finalPhone = phone ?? user.onboarding.phone;
      user.onboarding.phone = finalPhone;
      user.onboarding.phone_alt =
        phone_alt && phone_alt.trim() !== "" ? phone_alt : finalPhone;
    }

    await user.save({ session });
    await session.commitTransaction();

    res.json({
      message: "Perfil actualizado correctamente",
      user
    });

  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
};
