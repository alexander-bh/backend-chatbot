const Chatbot = require("../../models/Chatbot");
const Flow = require("../../models/Flow");
const FlowNode = require("../../models/FlowNode");
const mongoose = require("mongoose");
const crypto = require("crypto");
const systemAvatars = require("../../shared/enum/systemAvatars");
const {
  getBaseName,
  generateCopyName
} = require("../../utils/chatbotName.helper");

// ═══════════════════════════════════════════════════════════
// CREAR CHATBOT
// ═══════════════════════════════════════════════════════════
exports.createChatbot = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const {
      name,
      welcome_message,
      welcome_delay,
      show_welcome_on_mobile
    } = req.body;

    // ─────────── VALIDACIONES ───────────
    if (!req.user?.account_id) {
      await session.abortTransaction();
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    if (!name || typeof name !== "string" || !name.trim()) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Nombre inválido" });
    }

    if (name.length > 60) {
      await session.abortTransaction();
      return res.status(400).json({ message: "El nombre es demasiado largo" });
    }

    if (welcome_delay !== undefined && (welcome_delay < 0 || welcome_delay > 10)) {
      await session.abortTransaction();
      return res.status(400).json({ message: "welcome_delay inválido" });
    }

    // ─────────── CREAR CHATBOT ───────────
    const welcomeText =
      typeof welcome_message === "string" && welcome_message.trim()
        ? welcome_message
        : "Hola 👋 ¿en qué puedo ayudarte?";

    const chatbot = new Chatbot({
      account_id: req.user.account_id,
      public_id: crypto.randomUUID(),
      name: name.trim(),
      welcome_message: welcomeText,
      welcome_delay: welcome_delay ?? 2,
      show_welcome_on_mobile: show_welcome_on_mobile ?? true,
      status: "active",
      is_enabled: true
    });

    await chatbot.save({ session });

    // ─────────── CREAR FLOW INICIAL ───────────
    const [flow] = await Flow.create([{
      account_id: req.user.account_id,
      chatbot_id: chatbot._id,
      name: "Flujo principal",
      status: "draft",
      version: 1
    }], { session });

    // ─────────── CREAR NODO INICIAL ───────────
    const [startNode] = await FlowNode.create([{
      account_id: req.user.account_id,
      flow_id: flow._id,
      node_type: "text",
      content: welcomeText,
      order: 0,
      typing_time: 2,
      parent_node_id: null,
      next_node_id: null,
      is_draft: true
    }], { session });

    flow.start_node_id = startNode._id;
    await flow.save({ session });

    await session.commitTransaction();

    res.status(201).json({ chatbot, flow, start_node: startNode });

  } catch (error) {
    await session.abortTransaction();
    console.error("CREATE CHATBOT ERROR:", error);
    res.status(500).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

// ═══════════════════════════════════════════════════════════
// LISTAR CHATBOTS
// ═══════════════════════════════════════════════════════════
exports.listChatbots = async (req, res) => {
  try {
    if (!req.user?.account_id) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const chatbots = await Chatbot.find({
      account_id: req.user.account_id
    })
      .select("public_id name status is_enabled avatar created_at")
      .sort({ created_at: -1 })
      .lean();

    const formatted = chatbots.map(bot => ({
      ...bot,
      created_at: new Date(bot.created_at).toLocaleString("es-MX", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      })
    }));

    res.json(formatted);
  } catch (error) {
    res.status(500).json({ message: "Error al listar chatbots" });
  }
};

// ═══════════════════════════════════════════════════════════
// OBTENER CHATBOT POR ID
// ═══════════════════════════════════════════════════════════
exports.getChatbotById = async (req, res) => {
  try {
    if (!req.user?.account_id) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const chatbot = await Chatbot.findOne({
      _id: req.params.id,
      account_id: req.user.account_id
    })
      .select("-install_token -verified_domains")
      .lean();

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    res.json(chatbot);
  } catch (error) {
    console.error("GET CHATBOT ERROR:", error);
    res.status(500).json({ message: "Error al obtener chatbot" });
  }
};

// ═══════════════════════════════════════════════════════════
// DATOS DEL EDITOR
// ═══════════════════════════════════════════════════════════
exports.getChatbotEditorData = async (req, res) => {
  try {
    if (!req.user?.account_id) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const chatbot = await Chatbot.findOne({
      _id: req.params.id,
      account_id: req.user.account_id
    }).lean();

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    const flows = await Flow.find({
      chatbot_id: chatbot._id,
      account_id: req.user.account_id
    }).sort({ created_at: 1 }).lean();

    const flowsWithNodes = await Promise.all(
      flows.map(async flow => {
        const nodes = await FlowNode.find({
          flow_id: flow._id,
          account_id: req.user.account_id
        }).lean();

        return { ...flow, nodes };
      })
    );

    res.json({ chatbot, flows: flowsWithNodes });
  } catch (error) {
    console.error("EDITOR DATA ERROR:", error);
    res.status(500).json({ message: "Error al cargar editor" });
  }
};

// ═══════════════════════════════════════════════════════════
// ACTUALIZAR CHATBOT
// ═══════════════════════════════════════════════════════════
exports.updateChatbot = async (req, res) => {
  try {
    if (!req.user?.account_id) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const chatbot = await Chatbot.findOne({
      _id: req.params.id,
      account_id: req.user.account_id
    });

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

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

    // ─────────── ACTUALIZAR CAMPOS ───────────
    if (name !== undefined) {
      if (!name.trim() || name.length > 60) {
        return res.status(400).json({ message: "Nombre inválido" });
      }
      chatbot.name = name.trim();
    }

    if (welcome_message !== undefined) chatbot.welcome_message = welcome_message;
    if (welcome_delay !== undefined) {
      if (welcome_delay < 0 || welcome_delay > 10) {
        return res.status(400).json({ message: "welcome_delay inválido" });
      }
      chatbot.welcome_delay = welcome_delay;
    }
    if (show_welcome_on_mobile !== undefined) chatbot.show_welcome_on_mobile = show_welcome_on_mobile;
    if (primary_color !== undefined) chatbot.primary_color = primary_color;
    if (secondary_color !== undefined) chatbot.secondary_color = secondary_color;
    if (launcher_text !== undefined) chatbot.launcher_text = launcher_text;
    if (input_placeholder !== undefined) chatbot.input_placeholder = input_placeholder;
    if (position !== undefined) chatbot.position = position;
    if (show_branding !== undefined) chatbot.show_branding = show_branding;
    if (is_enabled !== undefined) chatbot.is_enabled = is_enabled;
    if (status !== undefined) chatbot.status = status;

    // ─────────── AVATAR POR ARCHIVO (upload) ───────────
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

    // ─────────── AVATAR POR URL (selección) ───────────
    if (avatar && !req.file) {
      // Validar que sea una URL válida o del sistema
      const isSystemAvatar = systemAvatars.some(a => a.url === avatar);
      const isUploadedAvatar = chatbot.uploaded_avatars?.some(a => a.url === avatar);

      if (!isSystemAvatar && !isUploadedAvatar) {
        try {
          new URL(avatar);
        } catch {
          return res.status(400).json({ message: "URL de avatar inválida" });
        }
      }

      chatbot.avatar = avatar;
    }

    if (req.body.allowed_domains !== undefined) {
      if (!Array.isArray(req.body.allowed_domains)) {
        return res.status(400).json({
          message: "allowed_domains debe ser un arreglo"
        });
      }

      chatbot.allowed_domains = req.body.allowed_domains
        .map(d => d.trim().toLowerCase())
        .filter(Boolean);
    }

    await chatbot.save();

    res.json({
      message: "Chatbot actualizado correctamente",
      chatbot
    });
  } catch (error) {
    console.error("UPDATE CHATBOT ERROR:", error);
    res.status(500).json({ message: "Error al actualizar chatbot" });
  }
};

// ═══════════════════════════════════════════════════════════
// ELIMINAR CHATBOT
// ═══════════════════════════════════════════════════════════
exports.deleteChatbot = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!req.user?.account_id) {
      await session.abortTransaction();
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const chatbot = await Chatbot.findOne({
      _id: req.params.id,
      account_id: req.user.account_id
    }).session(session);

    if (!chatbot) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    // ─────────── OBTENER FLOWS ───────────
    const flows = await Flow.find({
      chatbot_id: chatbot._id,
      account_id: req.user.account_id
    }).session(session);

    const flowIds = flows.map(f => f._id);

    // ─────────── ELIMINAR EN CASCADA ───────────
    await FlowNode.deleteMany(
      { flow_id: { $in: flowIds }, account_id: req.user.account_id },
      { session }
    );

    await Flow.deleteMany(
      { chatbot_id: chatbot._id, account_id: req.user.account_id },
      { session }
    );

    await Chatbot.deleteOne({ _id: chatbot._id }, { session });

    await session.commitTransaction();
    res.json({ message: "Chatbot eliminado correctamente" });

  } catch (error) {
    await session.abortTransaction();
    console.error("DELETE CHATBOT ERROR:", error);
    res.status(500).json({ message: "Error al eliminar chatbot" });
  } finally {
    session.endSession();
  }
};

// ═══════════════════════════════════════════════════════════
// DUPLICAR CHATBOT COMPLETO
// ═══════════════════════════════════════════════════════════
exports.duplicateChatbotFull = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!req.user?.account_id) {
      await session.abortTransaction();
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    // ─────────── CHATBOT ORIGEN ───────────
    const original = await Chatbot.findOne({
      _id: req.params.id,
      account_id: req.user.account_id
    }).session(session);

    if (!original) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    // ─────────── NUEVO CHATBOT ───────────
    const baseName = getBaseName(original.name);
    const newName = await generateCopyName(
      baseName,
      req.user.account_id,
      session
    );

    const newChatbot = new Chatbot({
      account_id: req.user.account_id,
      public_id: crypto.randomUUID(),
      name: newName,
      welcome_message: original.welcome_message,
      welcome_delay: original.welcome_delay,
      show_welcome_on_mobile: original.show_welcome_on_mobile,
      primary_color: original.primary_color,
      secondary_color: original.secondary_color,
      launcher_text: original.launcher_text,
      input_placeholder: original.input_placeholder,
      position: original.position,
      show_branding: original.show_branding,
      status: "draft", // ✅ Mejor empezar como draft
      is_enabled: false,
      avatar: original.avatar || process.env.DEFAULT_CHATBOT_AVATAR,
      uploaded_avatars: [] // ✅ No copiar avatars subidos (evita duplicación)
    });

    await newChatbot.save({ session });

    // ─────────── COPIAR FLOWS ───────────
    const originalFlows = await Flow.find({
      chatbot_id: original._id,
      account_id: req.user.account_id
    }).session(session);

    const flowIdMap = new Map();

    for (const flow of originalFlows) {
      const [createdFlow] = await Flow.create([{
        account_id: req.user.account_id,
        chatbot_id: newChatbot._id,
        name: flow.name,
        version: 1,
        is_active: false,
        is_draft: true,
        start_node_id: null
      }], { session });

      flowIdMap.set(String(flow._id), createdFlow);
    }

    // ─────────── COPIAR NODES ───────────
    const originalNodes = await FlowNode.find({
      flow_id: { $in: originalFlows.map(f => f._id) },
      account_id: req.user.account_id
    }).session(session);

    const nodeIdMap = new Map();

    // PASO 1: Crear nodos base
    for (const node of originalNodes) {
      const [createdNode] = await FlowNode.create([{
        account_id: req.user.account_id,
        flow_id: flowIdMap.get(String(node.flow_id))._id,
        node_type: node.node_type,
        content: node.content,
        order: node.order ?? 0,
        parent_node_id: null, // Se actualiza en PASO 2
        typing_time: node.typing_time ?? 2,
        variable_key: node.variable_key ?? null,
        validation: node.validation ?? null,
        crm_field_key: node.crm_field_key ?? null,
        link_action: node.link_action ?? null,
        options: [],
        is_draft: true
      }], { session });

      nodeIdMap.set(String(node._id), createdNode._id);
    }

    // PASO 2: Reconstruir relaciones (parent_node_id y options)
    for (const node of originalNodes) {
      const newNodeId = nodeIdMap.get(String(node._id));
      const newNode = await FlowNode.findById(newNodeId).session(session);

      // Actualizar parent_node_id
      if (node.parent_node_id) {
        newNode.parent_node_id = nodeIdMap.get(String(node.parent_node_id)) || null;
      }

      // Reconstruir options
      if (node.options?.length) {
        newNode.options = node.options.map(opt => ({
          label: opt.label,
          next_node_id: opt.next_node_id
            ? nodeIdMap.get(String(opt.next_node_id))
            : null
        }));
      }

      await newNode.save({ session });
    }

    // ─────────── ASIGNAR START NODES ───────────
    for (const flow of originalFlows) {
      if (!flow.start_node_id) continue;

      const newFlow = flowIdMap.get(String(flow._id));
      newFlow.start_node_id = nodeIdMap.get(String(flow.start_node_id)) || null;
      await newFlow.save({ session });
    }

    await session.commitTransaction();

    res.status(201).json({
      message: "Chatbot duplicado correctamente",
      chatbot_id: newChatbot._id
    });

  } catch (error) {
    await session.abortTransaction();
    console.error("DUPLICATE CHATBOT ERROR:", error);
    res.status(500).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

// ═══════════════════════════════════════════════════════════
// OBTENER AVATARS DISPONIBLES
// ═══════════════════════════════════════════════════════════
exports.getAvailableAvatars = async (req, res) => {
  try {
    if (!req.user?.account_id) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const chatbot = await Chatbot.findOne({
      _id: req.params.id,
      account_id: req.user.account_id
    }).lean();

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

// ═══════════════════════════════════════════════════════════
// ELIMINAR AVATAR SUBIDO
// ═══════════════════════════════════════════════════════════
exports.deleteAvatar = async (req, res) => {
  try {
    if (!req.user?.account_id) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const chatbot = await Chatbot.findOne({
      _id: req.params.id,
      account_id: req.user.account_id
    });

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    const { avatarUrl } = req.body;
    if (!avatarUrl) {
      return res.status(400).json({ message: "avatarUrl requerido" });
    }

    // ─────────── VALIDAR QUE NO SEA DEL SISTEMA ───────────
    if (avatars.some(a => a.url === avatarUrl)) {
      return res.status(400).json({
        message: "No se puede eliminar un avatar del sistema"
      });
    }

    const before = chatbot.uploaded_avatars.length;

    chatbot.uploaded_avatars = chatbot.uploaded_avatars.filter(
      a => a.url !== avatarUrl
    );

    if (before === chatbot.uploaded_avatars.length) {
      return res.status(404).json({ message: "Avatar no encontrado" });
    }

    // ─────────── SI ERA EL ACTIVO, RESETEAR ───────────
    if (chatbot.avatar === avatarUrl) {
      chatbot.avatar = process.env.DEFAULT_CHATBOT_AVATAR || avatars[0]?.url;
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