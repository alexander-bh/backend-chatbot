const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const mongoose = require("mongoose");

const User = require("../models/User");
const Token = require("../models/Token");
const Chatbot = require("../models/Chatbot");
const Account = require("../models/Account");
const Flow = require("../models/Flow");
const FlowNode = require("../models/FlowNode");
const ChatbotSettings = require("../models/ChatbotSettings");

const { generateToken } = require("../utils/jwt");

/* --------------------------------------------------
   Utils
-------------------------------------------------- */
const slugify = (text) =>
  text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "");

/* --------------------------------------------------
   REGISTER FIRST (crea cuenta + admin)
-------------------------------------------------- */
exports.registerFirst = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      account_name,
      name,
      email,
      password,
      phone,
      phone_alt,
      onboarding
    } = req.body;

    if (!account_name || !name || !email || !password || !phone) {
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
    const baseSlug = slugify(account_name);
    const slug = `${baseSlug}-${crypto.randomUUID().slice(0, 6)}`;

    const finalPhoneAlt =
      phone_alt && phone_alt.trim() !== "" ? phone_alt : phone;

    const hashedPassword = await bcrypt.hash(password, 10);
    const welcomeText = `Hola 👋 soy el bot de ${name}, ¿en qué puedo ayudarte?`;

    /* -------- Validar email -------- */
    const userExists = await User.findOne({ email: normalizedEmail }).session(session);
    if (userExists) {
      await session.abortTransaction();
      session.endSession();
      return res.status(409).json({
        message: "El email ya está registrado"
      });
    }

    /* -------- Account -------- */
    const [account] = await Account.create(
      [{
        name: account_name,
        slug,
        plan: "free",
        status: "active"
      }],
      { session }
    );

    /* -------- User (ADMIN) -------- */
    const finalOnboarding = {
      ...(onboarding || {}),
      phone,
      phone_alt: finalPhoneAlt
    };

    const [user] = await User.create(
      [{
        account_id: account._id,
        name,
        email: normalizedEmail,
        password: hashedPassword,
        role: "CLIENT",
        onboarding: finalOnboarding
      }],
      { session }
    );

    /* -------- Chatbot -------- */
    const [chatbot] = await Chatbot.create(
      [{
        account_id: account._id,
        name: `Bot de ${name}`,
        public_id: crypto.randomUUID(),
        welcome_message: welcomeText,
        status: "active"
      }],
      { session }
    );

    /* -------- Settings -------- */
    const [settings] = await ChatbotSettings.create(
      [{
        chatbot_id: chatbot._id,
        avatar: process.env.DEFAULT_CHATBOT_AVATAR,
        primary_color: "#2563eb",
        secondary_color: "#111827",
        launcher_text: "¿Te ayudo?",
        bubble_style: "rounded",
        font: "inter",
        position: {
          type: "bottom-right",
          offset_x: 24,
          offset_y: 24
        },
        is_enabled: true
      }],
      { session }
    );

    /* -------- Flow -------- */
    const [flow] = await Flow.create(
      [{
        account_id: account._id,
        chatbot_id: chatbot._id,
        name: "Flujo principal",
        is_default: true,
        is_active: false,
        is_draft: true,
        version: 1
      }],
      { session }
    );

    const [startNode] = await FlowNode.create(
      [{
        account_id: account._id,
        flow_id: flow._id,
        node_type: "text",
        content: welcomeText,
        next_node_id: null,
        position: { x: 100, y: 100 },
        is_draft: false
      }],
      { session }
    );

    /* -------- Token -------- */
    const token = generateToken({
      id: user._id,
      role: user.role,
      account_id: account._id
    });

    await Token.create(
      [{
        user_id: user._id,
        token,
        expires_at: new Date(Date.now() + 86400000)
      }],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      token,
      account,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      chatbot,
      flow,
      start_node: startNode,
      settings
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error("REGISTER FIRST ERROR:", error);
    res.status(500).json({
      message: "Error al registrar cuenta inicial"
    });
  }
};

/* --------------------------------------------------
   REGISTER USER (por subdominio)
-------------------------------------------------- */
exports.register = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const accountId = req.account._id;
    const {
      name,
      email,
      password,
      phone,
      phone_alt,
      role = "CLIENT",
      onboarding
    } = req.body;

    if (!name || !email || !password || !phone) {
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
      await session.abortTransaction();
      session.endSession();
      return res.status(409).json({
        message: "El email ya está registrado en esta cuenta"
      });
    }

    const finalPhoneAlt =
      phone_alt && phone_alt.trim() !== "" ? phone_alt : phone;

    const hashedPassword = await bcrypt.hash(password, 10);

    const finalOnboarding = {
      ...(onboarding || {}),
      phone,
      phone_alt: finalPhoneAlt
    };

    const [user] = await User.create(
      [{
        account_id: accountId,
        name,
        email: normalizedEmail,
        password: hashedPassword,
        role,
        onboarding: finalOnboarding
      }],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error("REGISTER ERROR:", error);
    res.status(500).json({
      message: "Error al registrar usuario"
    });
  }
};

/* --------------------------------------------------
   LOGIN
-------------------------------------------------- */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1️⃣ Validaciones
    if (!email || !password) {
      return res.status(400).json({
        message: "Email y contraseña obligatorios"
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({
      email: normalizedEmail
    }).select("+password");

    if (!user) {
      return res.status(401).json({
        message: "Credenciales inválidas"
      });
    }

    // 3️⃣ Validar contraseña
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({
        message: "Credenciales inválidas"
      });
    }

    // 4️⃣ Obtener cuenta
    const account = await Account.findById(user.account_id);

    if (!account || account.status !== "active") {
      return res.status(403).json({
        message: "Cuenta inactiva o inexistente"
      });
    }

    await Token.deleteMany({ user_id: user._id });

    // 6️⃣ Generar token
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

    // 7️⃣ Respuesta completa
    res.json({
      token,
      user: {
        name: user.name,
        email: user.email,
      },
    });

  } catch (error) {
    console.error("LOGIN AUTO ACCOUNT ERROR:", error);
    res.status(500).json({
      message: "Error al iniciar sesión"
    });
  }

};

/* --------------------------------------------------
   CHANGE PASSWORD
-------------------------------------------------- */
exports.changePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({
        message: "Contraseñas obligatorias"
      });
    }

    if (new_password.length < 6) {
      return res.status(400).json({
        message: "La nueva contraseña debe tener al menos 6 caracteres"
      });
    }

    const user = await User.findById(req.user.id).select("+password");
    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const valid = await bcrypt.compare(current_password, user.password);
    if (!valid) {
      return res.status(401).json({ message: "Contraseña actual incorrecta" });
    }

    const samePassword = await bcrypt.compare(new_password, user.password);
    if (samePassword) {
      return res.status(400).json({
        message: "La nueva contraseña debe ser diferente a la actual"
      });
    }

    user.password = await bcrypt.hash(new_password, 10);
    await user.save();

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

/* --------------------------------------------------
   UPDATE PROFILE
-------------------------------------------------- */
exports.updateProfile = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user = await User.findById(req.user.id).session(session);
    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const { name, email, phone, phone_alt } = req.body;

    if (name) user.name = name;
    if (email) user.email = email.toLowerCase().trim();

    if (phone || phone_alt) {
      user.onboarding ||= {};
      const finalPhone = phone ?? user.onboarding.phone;
      user.onboarding.phone = finalPhone;
      user.onboarding.phone_alt =
        phone_alt && phone_alt.trim() !== "" ? phone_alt : finalPhone;
    }

    await user.save({ session });
    await session.commitTransaction();
    session.endSession();

    res.json({
      message: "Perfil actualizado correctamente",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        onboarding: user.onboarding
      }
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("UPDATE PROFILE ERROR:", error);
    res.status(500).json({ message: "Error al actualizar perfil" });
  }
};

/* --------------------------------------------------
   LOGOUT
-------------------------------------------------- */
exports.logout = async (req, res) => {
  try {
    await Token.deleteMany({ user_id: req.user.id });
    res.json({ message: "Sesión cerrada correctamente" });
  } catch (error) {
    console.error("LOGOUT ERROR:", error);
    res.status(500).json({ message: "Error al cerrar sesión" });
  }
};
