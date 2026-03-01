const mongoose = require("mongoose");
const crypto = require("crypto");
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
const { createFallbackFlow } = require("../services/flowNode.service");
const systemAvatars = require("../shared/enum/systemAvatars");


// util simple
const slugify = (text) =>
  text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "");

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
      if (!name.trim() || name.length > 60) {
        return res.status(400).json({ message: "Nombre inválido" });
      }
      chatbot.name = name.trim();
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

    const allowedStatus = ["active","inactive"];
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
        created_at: new Date()
      });
    }

    /* ---------- AVATAR POR URL ---------- */
    if (avatar && !req.file) {
      const isSystem = systemAvatars.some(a => a.url === avatar);
      const isUploaded =
        chatbot.uploaded_avatars?.some(a => a.url === avatar);

      if (!isSystem && !isUploaded) {
        try {
          new URL(avatar);
        } catch {
          return res.status(400).json({ message: "URL inválida" });
        }
      }

      chatbot.avatar = avatar;
    }

    await chatbot.save();

    await auditService.log({
      req,
      targetType: "CHATBOT",
      targetId: chatbot._id,
      action: "UPDATE",
      before,
      after: chatbot.toObject()
    });

    res.json({
      message: "Chatbot actualizado correctamente (admin)",
      chatbot
    });

  } catch (error) {
    console.error("ADMIN UPDATE ERROR:", error);
    res.status(500).json({ message: "Error al actualizar chatbot" });
  }
};

exports.getAvailableAvatars = async (req, res) => {
  try {
    const chatbot = await Chatbot.findById(req.params.id).lean();

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

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

    if (systemAvatars.some(a => a.url === avatarUrl)) {
      return res.status(400).json({
        message: "No se puede eliminar un avatar del sistema"
      });
    }

    const beforeLength = chatbot.uploaded_avatars?.length || 0;

    chatbot.uploaded_avatars =
      chatbot.uploaded_avatars?.filter(a => a.url !== avatarUrl) || [];

    if (beforeLength === chatbot.uploaded_avatars.length) {
      return res.status(404).json({ message: "Avatar no encontrado" });
    }

    if (chatbot.avatar === avatarUrl) {
      chatbot.avatar =
        process.env.DEFAULT_CHATBOT_AVATAR ||
        systemAvatars[0]?.url;
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