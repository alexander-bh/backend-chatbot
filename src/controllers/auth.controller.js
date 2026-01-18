const User = require("../models/User");
const Token = require("../models/Token");
const Chatbot = require("../models/Chatbot");
const Account = require("../models/Account");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { generateToken } = require("../utils/jwt");
const ChatbotSettings = require("../models/ChatbotSettings");

exports.registerFirst = async (req, res) => {
  try {
    const { account_name, name, email, password, onboarding } = req.body;

    if (!account_name || !name || !email || !password) {
      return res.status(400).json({
        message: "Datos obligatorios incompletos"
      });
    }

    // 🔒 Usuario global duplicado
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(409).json({
        message: "El usuario ya existe"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Crear cuenta
    const account = await Account.create({
      name: account_name,
      plan: "free",
      status: "active"
    });

    // Crear usuario ADMIN
    const user = await User.create({
      account_id: account._id,
      name,
      email,
      password: hashedPassword,
      role: "ADMIN",
      onboarding
    });

    // Crear chatbot inicial
    const chatbot = await Chatbot.create({
      account_id: account._id,
      name: `Bot de ${name}`,
      public_id: crypto.randomUUID(),
      welcome_message: `Hola 👋 soy el bot de ${name}, ¿en qué puedo ayudarte?`,
      status: "active"
    });

    // Crear settings iniciales del chatbot
    const settings = await ChatbotSettings.create({
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
    });

    // Crear token
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

    return res.status(201).json({
      token,
      account,
      user,
      chatbot,
      settings
    });

  } catch (error) {
    console.error("REGISTER FIRST ERROR:", error);
    return res.status(500).json({
      message: "Error al registrar cuenta inicial"
    });
  }
};



exports.register = async (req, res) => {
  try {
    const {
      account_id,
      name,
      email,
      password,
      role,
      onboarding
    } = req.body;

    // Validaciones básicas
    if (!account_id || !name || !email || !password) {
      return res
        .status(400)
        .json({ message: "Datos obligatorios incompletos" });
    }

    // Verificar cuenta
    const accountExists = await Account.findById(account_id);
    if (!accountExists) {
      return res.status(404).json({ message: "Cuenta no encontrada" });
    }

    // Usuario duplicado (por cuenta)
    const userExists = await User.findOne({ account_id, email });
    if (userExists) {
      return res
        .status(409)
        .json({ message: "El usuario ya existe en esta cuenta" });
    }

    // Hash de password
    const hashedPassword = await bcrypt.hash(password, 10);

     // Crear cuenta
    const account = await Account.create({
      name: account_name,
      plan: "free",
      status: "active"
    });

    // Crear usuario ADMIN
    const user = await User.create({
      account_id: account._id,
      name,
      email,
      password: hashedPassword,
      role: "ADMIN",
      onboarding
    });

    // Crear chatbot inicial
    const chatbot = await Chatbot.create({
      account_id: account._id,
      name: `Bot de ${name}`,
      public_id: crypto.randomUUID(),
      welcome_message: `Hola 👋 soy el bot de ${name}, ¿en qué puedo ayudarte?`,
      status: "active"
    });

    // Crear settings iniciales del chatbot
    const settings = await ChatbotSettings.create({
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
    });

    return res.status(201).json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      account_id: user.account_id
    });
  } catch (error) {
    console.error("REGISTER ERROR:", error.message);
    return res.status(500).json({ message: "Error al registrar usuario" });
  }
};

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

exports.logout = async (req, res) => {
  await Token.deleteMany({ user_id: req.user.id });
  res.json({ message: "Sesión cerrada correctamente" });
};

