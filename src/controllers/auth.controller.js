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

// Registro de la primera cuenta junto con usuario, chatbot, configuración y flujo inicial
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

    const finalPhoneAlt =
      phone_alt && phone_alt.trim() !== "" ? phone_alt : phone;

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(409).json({
        message: "El usuario ya existe"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const welcomeText = `Hola 👋 soy el bot de ${name}, ¿en qué puedo ayudarte?`;

    const account = await Account.create(
      [{
        name: account_name,
        plan: "free",
        status: "active"
      }],
      { session }
    );

    const finalOnboarding = {
      ...(onboarding || {}),
      phone,
      phone_alt: finalPhoneAlt
    };

    const user = await User.create(
      [{
        account_id: account[0]._id,
        name,
        email,
        password: hashedPassword,
        role: "CLIENT",
        onboarding: finalOnboarding
      }],
      { session }
    );

    const chatbot = await Chatbot.create(
      [{
        account_id: account[0]._id,
        name: `Bot de ${name}`,
        public_id: crypto.randomUUID(),
        welcome_message: welcomeText,
        status: "active"
      }],
      { session }
    );

    const settings = await ChatbotSettings.create(
      [{
        chatbot_id: chatbot[0]._id,
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

    const flow = await Flow.create(
      [{
        account_id: account[0]._id,
        chatbot_id: chatbot[0]._id,
        name: "Flujo principal",
        is_default: true,
        is_active: false,
        is_draft: true,
        version: 1
      }],
      { session }
    );

    const startNode = await FlowNode.create(
      [{
        account_id: account[0]._id,
        flow_id: flow[0]._id,
        node_type: "text",
        content: welcomeText,
        next_node_id: null,
        position: { x: 100, y: 100 },
        is_draft: false
      }],
      { session }
    );

    const token = generateToken({
      id: user[0]._id,
      role: user[0].role,
      account_id: account[0]._id
    });

    await Token.create(
      [{
        user_id: user[0]._id,
        token,
        expires_at: new Date(Date.now() + 86400000)
      }],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      token,
      account: account[0],
      user: user[0],
      chatbot: chatbot[0],
      flow: flow[0],
      start_node: startNode[0],
      settings: settings[0]
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("REGISTER FIRST ERROR:", error);
    return res.status(500).json({
      message: "Error al registrar cuenta inicial"
    });
  }
};
// Registro de usuarios adicionales en una cuenta existente
exports.register = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      account_id,
      name,
      email,
      password,
      phone,
      phone_alt,
      role = "AGENT",
      onboarding
    } = req.body;

    if (!account_id || !name || !email || !password || !phone) {
      return res.status(400).json({
        message: "Datos obligatorios incompletos"
      });
    }

    const finalPhoneAlt =
      phone_alt && phone_alt.trim() !== "" ? phone_alt : phone;

    // 🔑 MISMA CORRECCIÓN AQUÍ
    const finalOnboarding = {
      ...(onboarding || {}),
      phone,
      phone_alt: finalPhoneAlt
    };

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create(
      [{
        account_id,
        name,
        email,
        password: hashedPassword,
        role,
        onboarding: finalOnboarding
      }],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      id: user[0]._id,
      name: user[0].name,
      email: user[0].email,
      role: user[0].role,
      onboarding: user[0].onboarding
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("REGISTER ERROR:", error);
    return res.status(500).json({
      message: "Error al registrar usuario"
    });
  }
};
// Actualización del perfil del usuario
exports.updateProfile = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = req.user.id;

    const {
      name,
      email,
      phone,
      phone_alt
    } = req.body;

    if (!name && !email && !phone && !phone_alt) {
      return res.status(400).json({
        message: "No hay datos para actualizar"
      });
    }

    const user = await User.findById(userId).session(session);
    if (!user) {
      return res.status(404).json({
        message: "Usuario no encontrado"
      });
    }

    // 🔹 Actualizar campos simples
    if (name) user.name = name;
    if (email) user.email = email;

    // 🔹 Actualizar teléfonos dentro de onboarding
    if (phone || phone_alt) {
      if (!user.onboarding) {
        user.onboarding = {};
      }

      const finalPhone = phone ?? user.onboarding.phone;
      const finalPhoneAlt =
        phone_alt && phone_alt.trim() !== ""
          ? phone_alt
          : finalPhone;

      user.onboarding.phone = finalPhone;
      user.onboarding.phone_alt = finalPhoneAlt;
    }

    await user.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.json({
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

    if (error.code === 11000) {
      return res.status(409).json({
        message: "El email ya está en uso"
      });
    }

    return res.status(500).json({
      message: "Error al actualizar perfil"
    });
  }
};
// Cambio de contraseña del usuario
exports.changePassword = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = req.user.id;
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({
        message: "La contraseña actual y la nueva son obligatorias"
      });
    }

    if (new_password.length < 6) {
      return res.status(400).json({
        message: "La nueva contraseña debe tener al menos 6 caracteres"
      });
    }

    const user = await User
      .findById(userId)
      .select("+password")
      .session(session);

    if (!user) {
      return res.status(404).json({
        message: "Usuario no encontrado"
      });
    }

    // 🔍 Verificar contraseña actual
    const isValid = await bcrypt.compare(current_password, user.password);
    if (!isValid) {
      return res.status(401).json({
        message: "La contraseña actual es incorrecta"
      });
    }

    // 🚫 Evitar reutilizar la misma contraseña
    const samePassword = await bcrypt.compare(new_password, user.password);
    if (samePassword) {
      return res.status(400).json({
        message: "La nueva contraseña debe ser diferente a la actual"
      });
    }

    // 🔐 Hash de la nueva contraseña
    const hashedPassword = await bcrypt.hash(new_password, 10);
    user.password = hashedPassword;

    await user.save({ session });

    // 🔒 Cerrar todas las sesiones activas del usuario
    await Token.deleteMany({ user_id: user._id }, { session });

    await session.commitTransaction();
    session.endSession();

    return res.json({
      message: "Contraseña actualizada correctamente. Vuelve a iniciar sesión."
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error("CHANGE PASSWORD ERROR:", error);
    return res.status(500).json({
      message: "Error al cambiar la contraseña"
    });
  }
};
// Login de usuarios
exports.login = async (req, res) => {
  const { email, password } = req.body;

  const user = await User
    .findOne({ email })
    .select("+password");

  if (!user) {
    return res.status(401).json({ message: "Credenciales inválidas" });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(401).json({ message: "Credenciales inválidas" });
  }

  await Token.deleteMany({ user_id: user._id });

  const token = generateToken({
    id: user._id,
    role: user.role,
    account_id: user.account_id
  });

  await Token.create({
    user_id: user._id,
    token,
    expires_at: new Date(Date.now() + 86400000)
  });

  res.json({ token });
};
// Logout de usuarios
exports.logout = async (req, res) => {
  await Token.deleteMany({ user_id: req.user.id });
  res.json({ message: "Sesión cerrada correctamente" });
};

