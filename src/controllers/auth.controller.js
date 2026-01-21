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


exports.registerFirst = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { account_name, name, email, password, onboarding } = req.body;

    if (!account_name || !name || !email || !password) {
      return res.status(400).json({
        message: "Datos obligatorios incompletos"
      });
    }

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

    const user = await User.create(
      [{
        account_id: account[0]._id,
        name,
        email,
        password: hashedPassword,
        role: "CLIENT",
        onboarding
      }],
      { session }
    );

    const chatbot = await Chatbot.create(
      [{
        account_id: account[0]._id,
        name: `Bot de ${name}`,
        public_id: crypto.randomUUID(),
        welcome_message: welcomeText, // opcional mantenerlo
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
        account_id: account[0]._id,   // ✅ OBLIGATORIO
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
        account_id: account[0]._id,   // ✅ OBLIGATORIO
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

exports.register = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      account_id,
      name,
      email,
      password,
      role = "AGENT",
      onboarding
    } = req.body;

    // Validaciones básicas
    if (!account_id || !name || !email || !password) {
      return res.status(400).json({
        message: "Datos obligatorios incompletos"
      });
    }

    // Verificar cuenta
    const accountExists = await Account.findById(account_id);
    if (!accountExists) {
      return res.status(404).json({
        message: "Cuenta no encontrada"
      });
    }

    // Usuario duplicado en la cuenta
    const userExists = await User.findOne({ account_id, email });
    if (userExists) {
      return res.status(409).json({
        message: "El usuario ya existe en esta cuenta"
      });
    }

    // Validar rol permitido
    const allowedRoles = ["ADMIN", "AGENT"];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        message: "Rol no permitido"
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Crear usuario
    const user = await User.create(
      [{
        account_id,
        name,
        email,
        password: hashedPassword,
        role,
        onboarding
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
      account_id: user[0].account_id
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

