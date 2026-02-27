const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Account = require("../models/Account");
const Chatbot = require("../models/Chatbot");
const Flow = require("../models/Flow");
const FlowNode = require("../models/FlowNode");
const AuditLog = require("../models/AuditLog");
const auditService = require("../services/audit.service");
const formatDateAMPM = require("../utils/formatDate");
const { cloneTemplateToFlow } = require("../services/flowNode.service");

/* ─────────────────────────────────────
   DASHBOARD
───────────────────────────────────── */
exports.getDashboard = async (req, res) => {
  try {
    const admin = await User.findById(req.user.id).select("-password");

    if (!admin || admin.role !== "ADMIN") {
      return res.status(403).json({ message: "No autorizado" });
    }

    const [users, accounts, chatbots, flows] = await Promise.all([
      User.countDocuments(),
      Account.countDocuments(),
      Chatbot.countDocuments(),
      Flow.countDocuments()
    ]);

    res.json({ admin, users, accounts, chatbots, flows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ─────────────────────────────────────
   USERS
───────────────────────────────────── */
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find({
      _id: { $ne: req.user.id }
    })
      .select("-password")
      .sort({ created_at: -1 })
      .lean();

    const formattedUsers = users.map(user => ({
      ...user,
      created_at_raw: user.created_at,
      created_at: formatDateAMPM(user.created_at)
    }));

    res.json(formattedUsers);
  } catch (err) {
    console.error("GET ALL USERS ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};

exports.getUserDetail = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }
    res.json(user);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.updateAnyUser = async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const loggedAdminId = req.user.id;

    const user = await User.findById(targetUserId);
    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const before = user.toObject();

    if (req.body.role && targetUserId === loggedAdminId) {
      return res.status(400).json({ message: "No puedes cambiar tu propio rol" });
    }

    if (req.body.role && user.role === "ADMIN") {
      return res.status(403).json({
        message: "No se puede modificar el rol de un administrador"
      });
    }

    if (req.body.role === "ADMIN") {
      return res.status(403).json({
        message: "El rol ADMIN solo puede asignarse desde la base de datos"
      });
    }

    delete req.body.password;
    delete req.body._id;
    delete req.body.role;

    Object.assign(user, req.body);
    await user.save();

    await auditService.log({
      req,
      targetType: "USER",
      targetId: user._id,
      action: "UPDATE",
      before,
      after: user.toObject()
    });

    res.json(user);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteAnyUser = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (req.user.id === req.params.id) {
      return res.status(400).json({
        message: "No puedes eliminar tu propio usuario"
      });
    }

    const user = await User.findById(req.params.id).session(session);
    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    // 🚫 No eliminar último admin
    if (user.role === "ADMIN") {
      const admins = await User.countDocuments({ role: "ADMIN" });
      if (admins <= 1) {
        return res.status(400).json({
          message: "No se puede eliminar el último administrador"
        });
      }
    }

    const before = user.toObject();

    /* ───────── ELIMINACIÓN EN CASCADA ───────── */

    // 1️⃣ Chatbots del usuario
    const chatbots = await Chatbot.find({
      account_id: user.account_id
    }).session(session);

    const chatbotIds = chatbots.map(c => c._id);

    // 2️⃣ Flows
    const flows = await Flow.find({
      chatbot_id: { $in: chatbotIds }
    }).session(session);

    const flowIds = flows.map(f => f._id);

    // 3️⃣ Flow nodes
    await FlowNode.deleteMany(
      { flow_id: { $in: flowIds } },
      { session }
    );

    // 4️⃣ Flows
    await Flow.deleteMany(
      { _id: { $in: flowIds } },
      { session }
    );

    // 5️⃣ Chatbots
    await Chatbot.deleteMany(
      { _id: { $in: chatbotIds } },
      { session }
    );

    // 6️⃣ Usuario
    await User.deleteOne(
      { _id: user._id },
      { session }
    );

    // 7️⃣ Auditoría
    await auditService.log({
      req,
      targetType: "USER",
      targetId: user._id,
      action: "DELETE",
      before,
      after: null,
      meta: {
        cascade: ["CHATBOT", "FLOW", "FLOW_NODE"]
      }
    });

    await session.commitTransaction();
    session.endSession();

    res.json({
      message: "Usuario y recursos asociados eliminados correctamente"
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("DELETE USER ERROR:", error);
    res.status(500).json({ message: "Error al eliminar usuario" });
  }
};

/* ─────────────────────────────────────
   ACCOUNTS
───────────────────────────────────── */
exports.getAllAccounts = async (req, res) => {
  try {
    const accounts = await Account.find()
      .sort({ created_at: -1 });

    res.json(accounts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ─────────────────────────────────────
   CHATBOTS
───────────────────────────────────── */
exports.createChatbotForUser = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { account_id, name } = req.body;

    /* ───────── VALIDACIONES ───────── */

    if (!account_id || !mongoose.Types.ObjectId.isValid(account_id)) {
      throw new Error("account_id inválido o requerido");
    }

    if (!name || typeof name !== "string" || !name.trim()) {
      throw new Error("Nombre del chatbot inválido");
    }

    /* ───────── BUSCAR USUARIO CLIENT ───────── */

    const ownerUser = await User.findOne({
      account_id,
      role: "CLIENT"
    }).session(session);

    if (!ownerUser) {
      throw new Error("No existe un usuario CLIENT para esta cuenta");
    }

    /* ───────── CREAR CHATBOT ───────── */

    const chatbot = await Chatbot.create([{
      account_id,
      owner_user_id: ownerUser._id,
      public_id: crypto.randomUUID(),
      name: name.trim(),
      welcome_message: "Hola 👋 ¿en qué puedo ayudarte?",
      welcome_delay: 2,
      show_welcome_on_mobile: true,
      status: "draft",          // 👈 correcto
      is_enabled: false,        // 👈 correcto
      created_by_admin: req.user._id
    }], { session });

    const chatbotDoc = chatbot[0];

    /* ───────── CLONAR FLOW TEMPLATE ───────── */

    const flow = await cloneTemplateToFlow(
      chatbotDoc._id,
      req.user._id,
      session,
      name.trim()
    );

    await session.commitTransaction();

    return res.status(201).json({
      message: "Chatbot creado y asignado correctamente",
      chatbot: chatbotDoc,
      flow_id: flow._id,
      start_node_id: flow.start_node_id,
      owner: {
        id: ownerUser._id,
        name: ownerUser.name,
        email: ownerUser.email
      }
    });

  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({
      message: error.message
    });
  } finally {
    session.endSession();
  }
};

exports.getAllChatbots = async (req, res) => {
  try {
    const chatbots = await Chatbot.find().sort({ created_at: -1 });

    const formatted = chatbots.map(chatbot => ({
      ...chatbot.toObject(),
      created_at: new Date(chatbot.created_at).toLocaleString("es-MX", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      })
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getChatbotDetail = async (req, res) => {
  try {
    const chatbot = await Chatbot.findById(req.params.id);
    if (!chatbot) {
      return res.status(404).json({
        message: "Chatbot no encontrado"
      });
    }
    res.json(chatbot);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.deleteAnyChatbot = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  let before;

  try {
    const chatbot = await Chatbot.findById(req.params.id).session(session);
    if (!chatbot) throw new Error("Chatbot no encontrado");

    before = chatbot.toObject();

    const flows = await Flow.find({ chatbot_id: chatbot._id }).session(session);
    const flowIds = flows.map(f => f._id);

    await FlowNode.deleteMany({ flow_id: { $in: flowIds } }, { session });
    await Flow.deleteMany({ chatbot_id: chatbot._id }, { session });
    await Chatbot.deleteOne({ _id: chatbot._id }, { session });

    await session.commitTransaction();

    await auditService.log({
      req,
      targetType: "CHATBOT",
      targetId: chatbot._id,
      action: "DELETE",
      before,
      after: null
    });

    res.json({ message: "Chatbot eliminado por admin" });
  } catch (err) {
    await session.abortTransaction();
    res.status(500).json({ message: err.message });
  } finally {
    session.endSession();
  }
};

exports.updateAnyChatbot = async (req, res) => {
  try {
    const chatbot = await Chatbot.findById(req.params.id);

    if (!chatbot) {
      return res.status(404).json({
        message: "Chatbot no encontrado"
      });
    }

    const before = chatbot.toObject();

    // ✅ Lista blanca de campos editables por admin
    const allowedFields = [
      "name",
      "status",
      "is_enabled",
      "welcome_message",
      "welcome_delay",
      "show_welcome_on_mobile",
      "avatar",
      "primary_color",
      "secondary_color",
      "launcher_text",
      "position",
      "input_placeholder",
      "show_branding"
    ];

    // 🔒 Aplicar solo campos permitidos
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        chatbot[field] = req.body[field];
      }
    }

    await chatbot.save();

    // 🧾 Auditoría
    await auditService.log({
      req,
      targetType: "CHATBOT",
      targetId: chatbot._id,
      action: "UPDATE",
      before,
      after: chatbot.toObject()
    });

    res.json(chatbot);

  } catch (error) {
    res.status(400).json({
      message: error.message
    });
  }
};

/* ─────────────────────────────────────
   FLOWS
───────────────────────────────────── */
exports.getFlowsByChatbot = async (req, res) => {
  try {
    const flows = await Flow.find({
      chatbot_id: req.params.chatbotId
    });

    res.json(flows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getFlowDetail = async (req, res) => {
  try {
    const flow = await Flow.findById(req.params.id);
    if (!flow) {
      return res.status(404).json({
        message: "Flow no encontrado"
      });
    }

    const nodes = await FlowNode.find({
      flow_id: flow._id
    });

    res.json({ flow, nodes });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ─────────────────────────────────────
   IMPERSONATE (SOPORTE)
───────────────────────────────────── */
exports.impersonateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    await auditService.log({
      req,
      targetType: "USER",
      targetId: user._id,
      action: "IMPERSONATE",
      before: null,
      after: null
    });

    res.json({
      message: "Impersonación permitida",
      impersonate: {
        user_id: user._id,
        account_id: user.account_id
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ─────────────────────────────────────
   AUDITORIAS
───────────────────────────────────── */
exports.getAuditLogs = async (req, res) => {
  try {
    const {
      actor,
      target,
      targetType,
      action,
      from,
      to,
      page = 1,
      limit = 50
    } = req.query;

    const query = {};

    if (actor) query.actor_id = actor;
    if (target) query.target_id = target;
    if (action) query.action = action;

    if (targetType) {
      const allowed = ["USER", "CHATBOT", "FLOW"];
      if (!allowed.includes(targetType)) {
        return res.status(400).json({ message: "targetType inválido" });
      }
      query.target_type = targetType;
    }

    if (from || to) {
      query.created_at = {};
      if (from) query.created_at.$gte = new Date(from);
      if (to) query.created_at.$lte = new Date(to);
    }

    const safeLimit = Math.min(Number(limit), 100);
    const skip = (Number(page) - 1) * safeLimit;

    const logs = await AuditLog.find(query)
      .populate("actor_id", "name email role")
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean();

    const total = await AuditLog.countDocuments(query);

    const formattedLogs = logs.map(log => ({
      ...log,
      created_at_raw: log.created_at,
      created_at: formatDateAMPM(log.created_at)
    }));

    res.json({
      data: formattedLogs,
      meta: {
        total,
        page: Number(page),
        limit: safeLimit,
        pages: Math.ceil(total / safeLimit)
      }
    });
  } catch (error) {
    console.error("AUDIT LOG ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};

/* ─────────────────────────────────────
  USERS || ADMIN
───────────────────────────────────── */
exports.createUserByAdmin = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const accountId = req.user.account_id;

    const { name, email, password, role, onboarding } = req.body;

    const allowedRoles = ["CLIENT", "ADMIN"];
    const roleNormalized = role?.toUpperCase();

    if (!allowedRoles.includes(roleNormalized)) {
      return res.status(400).json({ message: "Rol inválido" });
    }

    if (!name || !email || !password || !onboarding?.phone) {
      return res.status(400).json({ message: "Datos incompletos" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const exists = await User.findOne({
      email: normalizedEmail,
      account_id: accountId
    }).session(session);

    if (exists) {
      return res.status(409).json({ message: "Email ya registrado" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [user] = await User.create([{
      account_id: accountId,
      name,
      email: normalizedEmail,
      password: hashedPassword,
      role: roleNormalized,
      onboarding
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
    console.error(error);
    res.status(500).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

/* ──────────────────────────────────
  CREATE FLOW
───────────────────────────────────── */
exports.createOrReplaceGlobalFlow = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { name = "Diálogo Global por Defecto" } = req.body;

    /* ───────── VALIDACIÓN ───────── */

    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ message: "Solo ADMIN" });
    }

    /* ───────── BUSCAR FLOW GLOBAL EXISTENTE ───────── */

    const existing = await Flow.findOne({
      is_template: true
    }).session(session);

    if (existing) {
      // 🧹 eliminar nodos
      await FlowNode.deleteMany({
        flow_id: existing._id
      }).session(session);

      // 🧹 eliminar flow
      await Flow.deleteOne({
        _id: existing._id
      }).session(session);
    }

    /* ───────── CREAR FLOW GLOBAL ───────── */

    const [flow] = await Flow.create([{
      account_id: null,
      chatbot_id: null,
      name,
      is_template: true,
      status: "draft",
      version: 1
    }], { session });

    const [startNode] = await FlowNode.create([{
      account_id: null,
      flow_id: flow._id,
      order: 0,
      node_type: "text",
      content: "Hola 👋 ¿en qué puedo ayudarte?",
      typing_time: 2
    }], { session });

    flow.start_node_id = startNode._id;
    flow.status = "published";
    flow.published_at = new Date();

    await flow.save({ session });

    await session.commitTransaction();

    res.status(201).json({
      message: existing
        ? "Flow global reemplazado"
        : "Flow global creado",
      flow_id: flow._id
    });

  } catch (error) {
    await session.abortTransaction();
    console.error("GLOBAL FLOW ERROR:", error);
    res.status(500).json({
      message: error.message
    });
  } finally {
    session.endSession();
  }
};