const mongoose = require("mongoose");
const User = require("../models/User");
const Account = require("../models/Account");
const Chatbot = require("../models/Chatbot");
const Flow = require("../models/Flow");
const FlowNode = require("../models/FlowNode");
const AuditLog = require("../models/AuditLog");
const auditService = require("../services/audit.service");


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
    const users = await User.find({ _id: { $ne: req.user.id } })
      .select("-password")
      .sort({ created_at: -1 });

    res.json(users);
  } catch (err) {
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
  try {
    if (req.user.id === req.params.id) {
      return res.status(400).json({
        message: "No puedes eliminar tu propio usuario"
      });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    if (user.role === "ADMIN") {
      const admins = await User.countDocuments({ role: "ADMIN" });
      if (admins <= 1) {
        return res.status(400).json({
          message: "No se puede eliminar el último administrador"
        });
      }
    }

    const before = user.toObject();
    await user.deleteOne();

    await auditService.log({
      req,
      targetType: "USER",
      targetId: user._id,
      action: "DELETE",
      before,
      after: null
    });

    res.json({ message: "Usuario eliminado correctamente" });
  } catch (error) {
    res.status(500).json({ message: error.message });
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
exports.getAllChatbots = async (req, res) => {
    try {
        const chatbots = await Chatbot.find()
            .sort({ created_at: -1 });

        res.json(chatbots);
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

    const logs = await AuditLog.find(query)
      .populate("actor_id", "name email role")
      .sort({ created_at: -1 })
      .skip((page - 1) * limit)
      .limit(Math.min(Number(limit), 100));

    const total = await AuditLog.countDocuments(query);

    res.json({
      data: logs,
      meta: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



