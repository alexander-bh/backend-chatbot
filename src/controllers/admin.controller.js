const mongoose = require("mongoose");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Account = require("../models/Account");
const Chatbot = require("../models/Chatbot");
const Flow = require("../models/Flow");
const FlowNode = require("../models/FlowNode");
const AuditLog = require("../models/AuditLog");
const Avatar = require("../models/Avatar");
const Contact = require("../models/Contact");
const Ticket = require("../models/Ticket");
const SystemConfig = require("../models/SystemConfig");
const auditService = require("../services/audit.service");
const formatDateAMPM = require("../utils/formatDate");
const { deleteFromCloudinary } = require("../services/cloudinary.service");
const { cloneTemplateToFlow, createFallbackFlow } = require("../services/flowNode.service");
const slugify = require("../helper/slugify");
const getOrCreateConfig = require("../helper/getOrCreateConfig");

/* ─────────────────────────────────────
   DASHBOAR
───────────────────────────────────── */
exports.getDashboard = async (req, res) => {
  try {
    const admin = await User.findById(req.user.id).select("-password");

    if (!admin || admin.role !== "ADMIN") {
      return res.status(403).json({ message: "No autorizado" });
    }

    const [
      totalAccounts,
      totalUsers,
      totalChatbots,
      totalContacts,
      totalTickets,
    ] = await Promise.all([
      Account.countDocuments(),
      User.countDocuments(),
      Chatbot.countDocuments(),
      Contact.countDocuments({ is_deleted: false }),
      Ticket.countDocuments(),
    ]);

    res.json({
      admin,
      stats: {
        totalAccounts,
        totalUsers,
        totalChatbots,
        totalContacts,
        totalTickets,
      },
    });
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

    // ───── Validaciones de rol ─────
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

    delete req.body._id;
    delete req.body.role;

    // ───── PASSWORD (SEGURO) ─────
    if (req.body.password && req.body.password.trim() !== "") {
      if (req.body.password.length < 6) {
        return res.status(400).json({
          message: "La contraseña debe tener al menos 6 caracteres"
        });
      }

      user.password = await bcrypt.hash(req.body.password, 10);
    }

    delete req.body.password;

    const empresaNueva = req.body?.onboarding?.empresa;
    const empresaAnterior = user.onboarding?.empresa;

    Object.assign(user, req.body);
    await user.save();

    // ───── Sincroniza Account ─────
    if (
      empresaNueva &&
      empresaNueva.trim() !== "" &&
      empresaNueva !== empresaAnterior
    ) {
      await Account.findByIdAndUpdate(
        user.account_id,
        { name: empresaNueva.trim() }
      );
    }

    await auditService.log({
      req,
      targetType: "USER",
      targetId: user._id,
      action: "UPDATE",
      before,
      after: user.toObject()
    });

    res.json({ message: "Usuario actualizado correctamente" });
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

    const usersInAccount = await User.countDocuments({
      account_id: user.account_id
    }).session(session);

    if (usersInAccount <= 1) {
      await Account.deleteOne(
        { _id: user.account_id },
        { session }
      );
    }

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

    const defaultAvatar = await Avatar.findOne({
      type: "SYSTEM",
      is_default: true
    }).session(session);

    let avatarToUse = null;

    if (defaultAvatar) {
      avatarToUse = defaultAvatar.url;
    } else if (process.env.DEFAULT_CHATBOT_AVATAR) {
      avatarToUse = process.env.DEFAULT_CHATBOT_AVATAR;
    } else {
      const firstSystemAvatar = await Avatar.findOne({
        type: "SYSTEM"
      }).session(session);

      avatarToUse = firstSystemAvatar?.url || null;
    }

    const chatbot = await Chatbot.create([{
      account_id,
      owner_user_id: ownerUser._id,
      public_id: crypto.randomUUID(),
      name: name.trim(),
      welcome_message: "Hola 👋 ¿en qué puedo ayudarte?",
      welcome_delay: 2,
      show_welcome_on_mobile: true,
      status: "active",
      is_enabled: false,
      avatar: avatarToUse,
      created_by_admin: req.user._id
    }], { session });

    const chatbotDoc = chatbot[0];

    /* ───────── CLONAR FLOW TEMPLATE ───────── */

    let flow;
    let flowName = name.trim();

    try {
      flow = await cloneTemplateToFlow(
        chatbotDoc._id,
        req.user._id,
        session,
        flowName
      );
    } catch (err) {
      console.warn("⚠️ No hay flow global, creando flow básico");
      flow = await createFallbackFlow({
        chatbot_id: chatbotDoc._id,
        account_id: req.user.account_id,
        session,
        flowName
      });
    }

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

    const formatted = await Promise.all(
      chatbots.map(async (chatbot) => {
        const chatbotObj = {
          ...chatbot.toObject(),
          created_at: new Date(chatbot.created_at).toLocaleString("es-MX", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
          })
        };

        /* ── TRAER FLOW PUBLICADO ── */
        const flow = await Flow.findOne({
          chatbot_id: chatbot._id,
          status: "published"
        }).lean();

        if (!flow) {
          chatbotObj.dialog = null;
          return chatbotObj;
        }

        /* ── TRAER TODOS LOS NODOS DEL FLOW ── */
        const nodes = await FlowNode.find({
          flow_id: flow._id,
          is_draft: false
        })
          .sort({ order: 1 })
          .lean();

        chatbotObj.dialog = {
          ...flow,
          nodes
        };

        return chatbotObj;
      })
    );

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

    // ─────────── ELIMINAR AVATARES SUBIDOS (CLOUDINARY) ───────────
    if (Array.isArray(chatbot.uploaded_avatars)) {
      for (const avatar of chatbot.uploaded_avatars) {
        if (avatar.public_id) {
          try {
            await deleteFromCloudinary(avatar.public_id);
          } catch (err) {
            console.error(
              `Error eliminando avatar Cloudinary: ${avatar.public_id}`,
              err
            );
          }
        }
      }
    }

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
  const session = await mongoose.startSession();

  try {

    session.startTransaction();

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "ID de chatbot inválido" });
    }

    const chatbot = await Chatbot.findById(req.params.id).session(session);

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    const before = chatbot.toObject();

    const {
      name,
      welcome_message,
      welcome_delay,
      show_welcome_on_mobile,
      primary_color,
      secondary_color,
      launcher_text,
      input_placeholder,
      position,
      show_branding,
      is_enabled,
      status,
      avatar
    } = req.body;

    /* ---------- VALIDACIONES ---------- */

    if (name !== undefined) {
      const trimmed = name.trim();

      if (!trimmed || trimmed.length > 60) {
        return res.status(400).json({ message: "Nombre inválido" });
      }

      chatbot.name = trimmed;
    }

    if (welcome_delay !== undefined) {
      if (welcome_delay < 0 || welcome_delay > 10) {
        return res.status(400).json({ message: "welcome_delay inválido" });
      }

      chatbot.welcome_delay = welcome_delay;
    }

    const hexRegex = /^#([0-9A-F]{3}){1,2}$/i;

    if (primary_color !== undefined) {
      if (!hexRegex.test(primary_color)) {
        return res.status(400).json({ message: "Color primario inválido" });
      }
      chatbot.primary_color = primary_color;
    }

    if (secondary_color !== undefined) {
      if (!hexRegex.test(secondary_color)) {
        return res.status(400).json({ message: "Color secundario inválido" });
      }
      chatbot.secondary_color = secondary_color;
    }

    const allowedStatus = ["active", "inactive"];

    if (status !== undefined) {
      if (!allowedStatus.includes(status)) {
        return res.status(400).json({ message: "Status inválido" });
      }
      chatbot.status = status;
    }

    if (is_enabled !== undefined) chatbot.is_enabled = is_enabled;
    if (welcome_message !== undefined) chatbot.welcome_message = welcome_message;
    if (show_welcome_on_mobile !== undefined)
      chatbot.show_welcome_on_mobile = show_welcome_on_mobile;
    if (launcher_text !== undefined) chatbot.launcher_text = launcher_text;
    if (input_placeholder !== undefined)
      chatbot.input_placeholder = input_placeholder;
    if (position !== undefined) chatbot.position = position;
    if (show_branding !== undefined) chatbot.show_branding = show_branding;

    /* ---------- AVATAR POR ARCHIVO ---------- */

    if (req.file) {
      const avatarUrl = req.file.path;

      chatbot.avatar = avatarUrl;

      if (!Array.isArray(chatbot.uploaded_avatars)) {
        chatbot.uploaded_avatars = [];
      }

      chatbot.uploaded_avatars.push({
        id: crypto.randomUUID(),
        label: `Avatar ${chatbot.uploaded_avatars.length + 1}`,
        url: avatarUrl,
        public_id: req.file.filename,
        created_at: new Date()
      });
    }

    /* ---------- AVATAR POR URL ---------- */

    if (avatar && !req.file) {

      const systemAvatar = await Avatar.findOne({
        url: avatar,
        type: "SYSTEM"
      }).session(session);

      const isUploaded =
        chatbot.uploaded_avatars?.some(a => a.url === avatar);

      if (!systemAvatar && !isUploaded) {
        return res.status(400).json({
          message: "Solo se permiten avatares SYSTEM o CUSTOM del chatbot"
        });
      }

      chatbot.avatar = avatar;
    }

    await chatbot.save({ session });

    /* ───────── FLOW ───────── */

    let flow = await Flow.findOne({
      chatbot_id: chatbot._id,
      account_id: chatbot.account_id,
      is_template: false
    }).session(session);

    // 🔥 Si NO existe flow → crear fallback
    if (!flow) {

      flow = await createFallbackFlow({
        chatbot_id: chatbot._id,
        account_id: chatbot.account_id,
        session,
        name: chatbot.name
      });

    }
    else if (name !== undefined) {
      flow.name = `Diálogo del chatbot - ${chatbot.name}`;
      await flow.save({ session });
    }

    /* ---------- AUDIT ---------- */

    await auditService.log({
      req,
      targetType: "CHATBOT",
      targetId: chatbot._id,
      action: "UPDATE",
      before,
      after: chatbot.toObject()
    });

    await session.commitTransaction();

    res.json({
      message: "Chatbot actualizado correctamente (admin)",
      chatbot
    });

  } catch (error) {

    await session.abortTransaction();

    console.error("ADMIN UPDATE ERROR:", error);

    res.status(500).json({
      message: "Error al actualizar chatbot"
    });

  } finally {

    session.endSession();

  }
};

exports.getAvailableAvatars = async (req, res) => {
  try {
    const chatbot = await Chatbot.findById(req.params.id).lean();
    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    const systemAvatars = await Avatar.find({
      type: "SYSTEM"
    }).lean();

    res.json({
      system: systemAvatars,
      uploaded: chatbot.uploaded_avatars || [],
      active: chatbot.avatar
    });

  } catch (error) {
    console.error("GET AVATARS ERROR:", error);
    res.status(500).json({ message: "Error al obtener avatares" });
  }
};

exports.deleteAvatar = async (req, res) => {
  try {
    const chatbot = await Chatbot.findById(req.params.id);

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    const { avatarUrl } = req.body;
    if (!avatarUrl) {
      return res.status(400).json({ message: "avatarUrl requerido" });
    }

    // 🔥 Verificar si es avatar del sistema en BD
    const systemAvatar = await Avatar.findOne({
      url: avatarUrl,
      type: "SYSTEM"
    });

    if (systemAvatar) {
      return res.status(400).json({
        message: "No se puede eliminar un avatar del sistema"
      });
    }

    const avatarToDelete = chatbot.uploaded_avatars?.find(
      a => a.url === avatarUrl
    );

    if (!avatarToDelete) {
      return res.status(404).json({ message: "Avatar no encontrado" });
    }

    if (avatarToDelete.public_id) {
      await deleteFromCloudinary(avatarToDelete.public_id);
    }

    chatbot.uploaded_avatars = chatbot.uploaded_avatars.filter(
      a => a.url !== avatarUrl
    );

    if (chatbot.avatar === avatarUrl) {
      const fallback = await Avatar.findOne({ type: "SYSTEM" });
      chatbot.avatar =
        process.env.DEFAULT_CHATBOT_AVATAR ||
        fallback?.url ||
        null;
    }

    await chatbot.save();

    res.json({
      message: "Avatar eliminado correctamente",
      avatar: chatbot.avatar,
      uploaded_avatars: chatbot.uploaded_avatars
    });

  } catch (error) {
    console.error("DELETE AVATAR ERROR:", error);
    res.status(500).json({ message: "Error al eliminar avatar" });
  }
};

exports.toggleChatbot = async (req, res) => {
  try {
    const { id } = req.params;
    const account_id = req.user.account_id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID inválido" });
    }

    const chatbot = await Chatbot.findOne({
      _id: id,
      account_id,
    });

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    // 🔥 Toggle
    chatbot.is_enabled = !chatbot.is_enabled;

    // Opcional: sincronizar status si lo usas
    chatbot.status = chatbot.is_enabled ? "active" : "inactive";

    await chatbot.save();

    res.json({
      success: true,
      is_enabled: chatbot.is_enabled,
      status: chatbot.status,
    });
  } catch (error) {
    console.error("Toggle Chatbot Error:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

exports.regenerateInstallToken = async (req, res) => {
  try {
    const { publicId } = req.params;

    const chatbot = await Chatbot.findOne({ public_id: publicId });

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    // 🔐 Control de acceso
    if (
      req.user.role !== "ADMIN" &&
      String(chatbot.account_id) !== String(req.user.account_id)
    ) {
      return res.status(403).json({ message: "No autorizado" });
    }

    chatbot.install_token = crypto.randomUUID();
    chatbot.allowed_domains = []; // opcional: invalidar dominios

    await chatbot.save();

    res.json({
      success: true,
      install_token: chatbot.install_token
    });

  } catch (error) {
    console.error("REGENERATE TOKEN ERROR:", error);
    res.status(500).json({ message: "Error regenerando token" });
  }
};

/* ─────────────────────────────────────
   FLOWS
───────────────────────────────────── */
exports.getFlowDetail = async (req, res) => {
  try {

    if (req.user.role !== "ADMIN") {
      return res.json({
        success: true,
        flow: null,
        nodes: []
      });
    }

    const flow = await Flow.findOne({
      is_template: true,
      account_id: null,
      chatbot_id: null
    });

    if (!flow) {
      return res.json({
        success: true,
        flow: null,
        nodes: []
      });
    }

    const nodes = await FlowNode.find({
      flow_id: flow._id
    }).sort({ order: 1 });

    res.json({
      success: true,
      flow,
      nodes
    });

  } catch (error) {
    console.error("GET FLOW DETAIL ERROR:", error);

    res.status(500).json({
      message: "Error obteniendo flow"
    });
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
    const { name, email, password, role, onboarding, account_name } = req.body;

    /* ───────── VALIDACIONES ───────── */

    const allowedRoles = ["CLIENT", "ADMIN"];
    const roleNormalized = role?.toUpperCase();

    if (!allowedRoles.includes(roleNormalized)) {
      return res.status(400).json({ message: "Rol inválido" });
    }

    if (!name || !email || !password || !onboarding?.phone || !account_name) {
      return res.status(400).json({ message: "Datos incompletos" });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: "La contraseña debe tener al menos 6 caracteres"
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const exists = await User.findOne({
      email: normalizedEmail
    }).session(session);

    if (exists) {
      return res.status(409).json({ message: "Email ya registrado" });
    }

    /* ───────── ACCOUNT (NUEVA) ───────── */

    const slug = `${slugify(account_name)}-${crypto.randomUUID().slice(0, 6)}`;

    const [account] = await Account.create([{
      name: account_name,
      slug,
      plan: "free",
      status: "active"
    }], { session });

    /* ───────── USER ───────── */

    const hashedPassword = await bcrypt.hash(password, 10);

    const finalPhoneAlt =
      onboarding.phone_alt && onboarding.phone_alt.trim() !== ""
        ? onboarding.phone_alt
        : onboarding.phone;

    const [user] = await User.create([{
      account_id: account._id,
      name,
      email: normalizedEmail,
      password: hashedPassword,
      role: roleNormalized,
      onboarding: {
        ...onboarding,
        phone: onboarding.phone,
        phone_alt: finalPhoneAlt
      }
    }], { session });

    await session.commitTransaction();

    res.status(201).json({
      message: "Usuario y cuenta creados correctamente",
      account: {
        id: account._id,
        name: account.name,
        slug: account.slug
      },
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error("CREATE USER BY ADMIN ERROR:", error);
    res.status(500).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

// Avatar 
exports.createAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Imagen requerida" });
    }

    const avatar = await Avatar.create({
      label: req.body.label || "Avatar del sistema",
      url: req.file.path,
      public_id: req.file.filename,
      type: "SYSTEM", // 🔥 CAMBIO AQUÍ
      created_by: req.user._id
    });

    res.status(201).json({
      message: "Avatar SYSTEM creado correctamente",
      avatar
    });

  } catch (error) {
    console.error("CREATE AVATAR ERROR:", error);
    res.status(500).json({ message: "Error al crear avatar" });
  }
};

exports.getAllAvatars = async (req, res) => {
  try {
    const avatars = await Avatar.find({ type: "SYSTEM" }) // 🔥 FILTRO AQUÍ
      .sort({ created_at: -1 })
      .lean();

    const formattedAvatars = avatars.map(avatar => ({
      ...avatar,
      created_at_raw: avatar.created_at,
      created_at: formatDateAMPM(avatar.created_at)
    }));

    res.json(formattedAvatars);

  } catch (error) {
    console.error("GET AVATARS ERROR:", error);
    res.status(500).json({ message: "Error al obtener avatares" });
  }
};

exports.deleteAvatarGlobal = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const avatar = await Avatar.findById(req.params.id).session(session);

    if (!avatar) {
      throw new Error("Avatar no encontrado");
    }

    /* ───────── OBTENER AVATAR FALLBACK ───────── */

    const fallbackAvatar = await Avatar.findOne({
      type: "SYSTEM"
    }).session(session);

    if (!fallbackAvatar) {
      throw new Error("No existe avatar SYSTEM de respaldo");
    }

    const fallbackUrl =
      process.env.DEFAULT_CHATBOT_AVATAR || fallbackAvatar.url;

    /* ───────── REEMPLAZO AUTOMÁTICO ───────── */

    const result = await Chatbot.updateMany(
      { avatar: avatar.url },
      { $set: { avatar: fallbackUrl } },
      { session }
    );

    /* ───────── ELIMINAR CLOUDINARY ───────── */

    if (avatar.public_id) {
      await deleteFromCloudinary(avatar.public_id);
    }

    /* ───────── ELIMINAR BD ───────── */

    await Avatar.deleteOne(
      { _id: avatar._id },
      { session }
    );

    await session.commitTransaction();

    res.json({
      message: "Avatar eliminado y reemplazado automáticamente",
      replaced_chatbots: result.modifiedCount
    });

  } catch (error) {
    await session.abortTransaction();
    console.error("DELETE AVATAR GLOBAL ERROR:", error);
    res.status(400).json({
      message: error.message
    });
  } finally {
    session.endSession();
  }
};

exports.setDefaultAvatar = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const avatar = await Avatar.findById(req.params.id).session(session);

    if (!avatar) {
      throw new Error("Avatar no encontrado");
    }

    if (avatar.type !== "SYSTEM") {
      throw new Error("Solo avatars SYSTEM pueden ser predeterminados");
    }

    // 1️⃣ Quitar default a todos
    await Avatar.updateMany(
      { type: "SYSTEM", is_default: true },
      { $set: { is_default: false } },
      { session }
    );

    // 2️⃣ Activar este
    avatar.is_default = true;
    await avatar.save({ session });

    await session.commitTransaction();

    res.json({
      message: "Avatar marcado como predeterminado",
      avatar
    });

  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

// controllers/contact.controller.js
exports.createDefaultContactTemplate = async (req, res) => {
  try {
    /* =========================
       PERMISOS
    ========================= */
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ message: "Solo ADMIN" });
    }

    /* =========================
       BASE TEMPLATE
    ========================= */
    const data = {
      account_id: null,
      source: "system",
      is_template: true,
      completed: false,
      variables: {},
      status: "new"
    };

    /* =========================
       CAMPOS PERMITIDOS
    ========================= */
    const allowedFields = [
      // 👤 Personales
      "name",
      "last_name",
      "email",
      "phone",
      "birth_date",

      // 🏢 Empresa
      "company",
      "website",
      "company_phone",
      "phone_ext",
      "position",
      "city",
      "country",
      "state",
      "postal_code",
      "address",
      "job_title",
      "privacy",
      "notes",

      // 📝 Extra
      "observations",
      "data_processing_consent"
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        data[field] = req.body[field];
      }
    }

    /* =========================
       CREATE
    ========================= */
    const contact = await Contact.create(data);

    res.status(201).json({
      message: "Contacto plantilla creado",
      contact
    });

  } catch (error) {
    console.error("CREATE DEFAULT TEMPLATE ERROR:", error);
    res.status(500).json({ message: "Error al crear plantilla" });
  }
};

exports.updateDefaultContactTemplate = async (req, res) => {
  try {
    /* =========================
       PERMISOS
    ========================= */
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ message: "Solo ADMIN" });
    }

    const { id } = req.params;

    /* =========================
       VALIDAR ID
    ========================= */
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID inválido" });
    }

    /* =========================
       CAMPOS PERMITIDOS
    ========================= */
    const allowedFields = [
      // 👤 Personales
      "name",
      "last_name",
      "email",
      "phone",
      "birth_date",

      // 🏢 Empresa
      "company",
      "website",
      "company_phone",
      "phone_ext",
      "position",
      "city",
      "country",
      "state",
      "postal_code",
      "address",
      "job_title",
      "privacy",
      "notes",

      // 📝 Extra
      "observations",
      "data_processing_consent"
    ];

    const updates = {};
    const body = req.body;

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    /* =========================
       MAPEO FRONTEND → SCHEMA
    ========================= */
    if (body.privacy !== undefined) {
      updates.data_processing_consent = body.privacy;
    }

    if (body.notes !== undefined) {
      updates.observations = body.notes;
    }

    /* =========================
       CAMPOS PROTEGIDOS
    ========================= */
    delete updates._id;
    delete updates.account_id;
    delete updates.chatbot_id;
    delete updates.session_id;
    delete updates.source;
    delete updates.is_template;
    delete updates.is_deleted;

    /* =========================
       UPDATE
    ========================= */
    const template = await Contact.findOneAndUpdate(
      { _id: id, is_template: true },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!template) {
      return res.status(404).json({ message: "Template no encontrado" });
    }

    res.json({
      message: "Template actualizado",
      template
    });

  } catch (error) {
    console.error("UPDATE TEMPLATE ERROR:", error);
    res.status(500).json({ message: "Error al actualizar template" });
  }
};

exports.getDefaultContactTemplates = async (req, res) => {
  try {
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ message: "Solo ADMIN" });
    }

    const templates = await Contact.find({
      is_template: true,
      is_deleted: false
    })
      .sort({ createdAt: -1 })
      .lean();

    const formattedTemplates = templates.map(template => ({
      ...template,
      createdAtFormatted: formatDateAMPM(template.createdAt),
      updatedAtFormatted: formatDateAMPM(template.updatedAt)
    }));

    res.json({
      total: formattedTemplates.length,
      templates: formattedTemplates
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteDefaultContactTemplate = async (req, res) => {
  try {
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ message: "Solo ADMIN" });
    }

    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID inválido" });
    }

    const deleted = await Contact.findOneAndDelete({
      _id: id,
      is_template: true
    });

    if (!deleted) {
      return res.status(404).json({ message: "Template no encontrado" });
    }

    res.json({ message: "Template eliminado permanentemente" });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/* ─────────────────────────────────────
   SYSTEM CONFIG (BCC)
───────────────────────────────────── */
exports.getSystemConfig = async (req, res) => {
  try {
    const configs = await SystemConfig.find().lean();

    const result = configs.reduce((acc, c) => {
      acc[c.key] = c.value;
      return acc;
    }, {});

    // ✅ BCC (email)
    result.bcc_email =
      result.bcc_email ?? process.env.BCC_EMAIL ?? null;

    // ✅ WHATSAPP
    result.whatsapp_notify =
      result.whatsapp_notify ?? process.env.WHATSAPP_NOTIFY ?? null;

    res.json({ config: result });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateSystemConfig = async (req, res) => {
  try {
    const { bcc_email, whatsapp_notify } = req.body;

    const updates = [];

    // ───────── EMAIL ─────────
    if (bcc_email !== undefined) {
      if (bcc_email !== null && bcc_email !== "") {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(bcc_email.trim())) {
          return res.status(400).json({
            message: "Formato de BCC inválido"
          });
        }
      }

      updates.push(
        SystemConfig.findOneAndUpdate(
          { key: "bcc_email" },
          { $set: { value: bcc_email?.trim() || null } },
          { upsert: true, new: true }
        )
      );
    }

    // ───────── WHATSAPP ─────────
    if (whatsapp_notify !== undefined) {

      if (whatsapp_notify && whatsapp_notify.phone) {

        const lada = whatsapp_notify.lada || "+52";
        const phone = String(whatsapp_notify.phone).replace(/\D/g, "");

        if (phone.length < 7 || phone.length > 15) {
          return res.status(400).json({
            message: "Número de WhatsApp inválido"
          });
        }

        updates.push(
          SystemConfig.findOneAndUpdate(
            { key: "whatsapp_notify" },
            {
              $set: {
                value: {
                  lada,
                  phone
                }
              }
            },
            { upsert: true, new: true }
          )
        );

      } else {

        updates.push(
          SystemConfig.findOneAndUpdate(
            { key: "whatsapp_notify" },
            { $set: { value: null } },
            { upsert: true }
          )
        );

      }
    }

    if (updates.length === 0) {
      return res.status(400).json({
        message: "No hay campos para actualizar"
      });
    }

    await Promise.all(updates);

    res.json({
      message: "Configuración actualizada correctamente"
    });

  } catch (err) {
    console.error("UPDATE SYSTEM CONFIG ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};

exports.clearBccEmail = async (req, res) => {
  try {
    await SystemConfig.findOneAndUpdate(
      { key: "bcc_email" },
      { $set: { value: null } },
      { upsert: true, new: true }
    );

    res.json({ message: "BCC eliminado correctamente" });
  } catch (err) {
    console.error("CLEAR BCC EMAIL ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};

exports.clearWhatsappNotify = async (req, res) => {
  try {
    await SystemConfig.findOneAndUpdate(
      { key: "whatsapp_notify" },
      { $set: { value: null } },
      { upsert: true, new: true }
    );

    res.json({ message: "WhatsApp eliminado correctamente" });

  } catch (err) {
    console.error("CLEAR WHATSAPP ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};


/* ─────────────────────────────────────
   GET  /api/admin/support-config
───────────────────────────────────── */
exports.getSupportConfig = async (req, res) => {
  try {
    const config = await SupportConfig.findOne().lean();

    res.json({
      support_whatsapp: config?.support_whatsapp ?? null,
      support_email: config?.support_email ?? null,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ─────────────────────────────────────
   PUT  /api/admin/support-config
───────────────────────────────────── */
exports.updateSupportConfig = async (req, res) => {
  try {
    const { support_email, support_whatsapp } = req.body;

    const config = await getOrCreateConfig();

    /* ── validar email ── */
    if (support_email !== undefined) {
      if (support_email && support_email.trim() !== "") {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(support_email.trim())) {
          return res.status(400).json({ message: "Formato de email inválido" });
        }
        config.support_email = support_email.trim();
      } else {
        config.support_email = null;
      }
    }

    /* ── validar whatsapp (solo dígitos, 7–15 chars) ── */
    if (support_whatsapp !== undefined) {
      if (support_whatsapp && support_whatsapp.trim() !== "") {
        const phoneClean = support_whatsapp.replace(/\D/g, "");
        if (phoneClean.length < 7 || phoneClean.length > 15) {
          return res.status(400).json({ message: "Número de WhatsApp inválido (7–15 dígitos)" });
        }
        config.support_whatsapp = phoneClean;
      } else {
        config.support_whatsapp = null;
      }
    }

    await config.save();

    res.json({
      message: "Configuración de soporte actualizada correctamente",
      config: {
        support_email: config.support_email,
        support_whatsapp: config.support_whatsapp,
      },
    });
  } catch (err) {
    console.error("UPDATE SUPPORT CONFIG ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};
/* ─────────────────────────────────────
   DELETE  /api/admin/support-config?field=support_email
           /api/admin/support-config?field=support_whatsapp
           /api/admin/support-config          ← limpia ambos
───────────────────────────────────── */
exports.clearSupportConfig = async (req, res) => {
  try {
    const { field } = req.query;

    const allowed = ["support_email", "support_whatsapp"];

    if (field && !allowed.includes(field)) {
      return res.status(400).json({ message: "Campo inválido. Usa: support_email o support_whatsapp" });
    }

    const config = await getOrCreateConfig();

    if (field) {
      config[field] = null;
    } else {
      config.support_email = null;
      config.support_whatsapp = null;
    }

    await config.save();

    res.json({
      message: field
        ? `${field} eliminado correctamente`
        : "Configuración de soporte eliminada correctamente",
    });
  } catch (err) {
    console.error("CLEAR SUPPORT CONFIG ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};