const Chatbot = require("../models/Chatbot");
const Flow = require("../models/Flow");
const FlowNode = require("../models/FlowNode");
const mongoose = require("mongoose");
const crypto = require("crypto");
const avatars = require("../config/chatbotAvatars");
const {
  getBaseName,
  generateCopyName
} = require("../utils/chatbotName.helper");
const MAX_AVATARS = 50;

// Crear chatbot
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

    if (!name) throw new Error("El nombre es obligatorio");

    if (welcome_delay !== undefined &&
        (welcome_delay < 0 || welcome_delay > 10)) {
      throw new Error("welcome_delay inválido");
    }

    const welcomeText =
      welcome_message || "Hola 👋 ¿en qué puedo ayudarte?";

    /* ───── CHATBOT ───── */
    const [chatbot] = await Chatbot.create([{
      account_id: req.user.account_id,
      public_id: crypto.randomUUID(),
      name,
      welcome_message: welcomeText,
      welcome_delay,
      show_welcome_on_mobile,
      status: "inactive",
      is_enabled: false
    }], { session });

    /* ───── FLOW ───── */
    const [flow] = await Flow.create([{
      account_id: req.user.account_id,
      chatbot_id: chatbot._id,
      name: "Flujo principal",
      status: "draft",
      version: 1
    }], { session });

    /* ───── START NODE ───── */
    const [startNode] = await FlowNode.create([{
      account_id: req.user.account_id,
      flow_id: flow._id,
      node_type: "text",
      content: welcomeText,
      order: 0,
      typing_time: 2,
      parent_node_id: null,
      next_node_id: null,
      variable_key: null,
      validation: null,
      crm_field_key: null,
      link_action: null,
      is_draft: true
    }], { session });

    flow.start_node_id = startNode._id;
    await flow.save({ session });

    await session.commitTransaction();

    res.status(201).json({
      chatbot,
      flow,
      start_node: startNode
    });

  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

// Listar chatbot
exports.listChatbots = async (req, res) => {
  try {
    const chatbots = await Chatbot.find({
      account_id: req.user.account_id
    })
      .sort({ created_at: -1 })
      .lean();

    res.json(chatbots);
  } catch (error) {
    console.error("LIST CHATBOTS ERROR:", error);
    res.status(500).json({ message: "Error al listar chatbots" });
  }
};

//Obtener chatbot por id
exports.getChatbotById = async (req, res) => {
  try {
    const chatbot = await Chatbot.findOne({
      _id: req.params.id,
      account_id: req.user.account_id
    }).lean();

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    res.json(chatbot);
  } catch (error) {
    console.error("GET CHATBOT ERROR:", error);
    res.status(500).json({ message: "Error al obtener chatbot" });
  }
};

// Editor
exports.getChatbotEditorData = async (req, res) => {
  try {
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

// Actualizar chatbot + configuracion
exports.updateChatbot = async (req, res) => {
  try {
    const chatbot = await Chatbot.findOne({
      _id: req.params.id,
      account_id: req.user.account_id
    });

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    // Asegurar array
    if (!Array.isArray(chatbot.uploaded_avatars)) {
      chatbot.uploaded_avatars = [];
    }

    /* ───── AVATAR SUBIDO ───── */
    if (req.file) {
      const avatarUrl = req.file.path;

      chatbot.avatar = avatarUrl;

      const exists = chatbot.uploaded_avatars.some(
        a => a.url === avatarUrl
      );

      if (!exists) {
        // 🔴 LIMITE DE AVATARES
        if (chatbot.uploaded_avatars.length >= MAX_AVATARS) {
          // elimina el más antiguo
          chatbot.uploaded_avatars.shift();
        }

        chatbot.uploaded_avatars.push({
          id: crypto.randomUUID(),
          label: `Avatar ${chatbot.uploaded_avatars.length + 1}`,
          url: avatarUrl,
          created_at: new Date()
        });
      }
    }

    /* ───── AVATAR DEL SISTEMA ───── */
    else if (req.body.avatar) {
      if (!req.body.avatar.startsWith("http")) {
        return res.status(400).json({ message: "Avatar inválido" });
      }
      chatbot.avatar = req.body.avatar;
    }

    /* ───── RESTO DE SETTINGS ───── */
    chatbot.name = req.body.name ?? chatbot.name;
    chatbot.status = req.body.status ?? chatbot.status;
    chatbot.welcome_message =
      req.body.welcome_message ?? chatbot.welcome_message;
    chatbot.primary_color =
      req.body.primary_color ?? chatbot.primary_color;
    chatbot.secondary_color =
      req.body.secondary_color ?? chatbot.secondary_color;
    chatbot.launcher_text =
      req.body.launcher_text ?? chatbot.launcher_text;
    chatbot.is_enabled =
      req.body.is_enabled ?? chatbot.is_enabled;
    chatbot.position =
      req.body.position ?? chatbot.position;
    chatbot.input_placeholder =
      req.body.input_placeholder ?? chatbot.input_placeholder;
    chatbot.show_branding =
      req.body.show_branding ?? chatbot.show_branding;
    chatbot.welcome_delay =
      req.body.welcome_delay ?? chatbot.welcome_delay;
    chatbot.show_welcome_on_mobile =
      req.body.show_welcome_on_mobile ??
      chatbot.show_welcome_on_mobile;

    await chatbot.save();

    res.json({
      avatar: chatbot.avatar,
      uploaded_avatars: chatbot.uploaded_avatars
    });
  } catch (error) {
    console.error("UPDATE CHATBOT ERROR:", error);
    res.status(500).json({ message: "Error al actualizar chatbot" });
  }
};

// Eliminar
exports.deleteChatbot = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const chatbot = await Chatbot.findOne({
      _id: req.params.id,
      account_id: req.user.account_id
    }).session(session);

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    const flows = await Flow.find({
      chatbot_id: chatbot._id
    }).session(session);

    const flowIds = flows.map(f => f._id);

    await FlowNode.deleteMany({ flow_id: { $in: flowIds }, account_id: req.user.account_id }, { session });
    await Flow.deleteMany({ chatbot_id: chatbot._id, account_id: req.user.account_id }, { session });
    await Chatbot.deleteOne({ _id: chatbot._id }, { session });

    await session.commitTransaction();
    session.endSession();

    res.json({ message: "Chatbot eliminado correctamente" });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("DELETE CHATBOT ERROR:", error);
    res.status(500).json({ message: "Error al eliminar chatbot" });
  }
};

// Duplicar el chatabot 
exports.duplicateChatbotFull = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    /* ───────── CHATBOT ORIGEN ───────── */
    const original = await Chatbot.findOne({
      _id: req.params.id,
      account_id: req.user.account_id
    }).session(session);

    if (!original) throw new Error("Chatbot no encontrado");

    /* ───────── NUEVO CHATBOT ───────── */
    const baseName = getBaseName(original.name);
    const newName = await generateCopyName(
      baseName,
      req.user.account_id,
      session
    );

    const [newChatbot] = await Chatbot.create([{
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
      status: "inactive",
      is_enabled: false,
      avatar: process.env.DEFAULT_CHATBOT_AVATAR,
      uploaded_avatars: []
    }], { session });

    /* ───────── FLOWS ───────── */
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

    /* ───────── NODES ───────── */
    const originalNodes = await FlowNode.find({
      flow_id: { $in: originalFlows.map(f => f._id) },
      account_id: req.user.account_id
    }).session(session);

    const nodeIdMap = new Map();

    /* PASO 1 — crear nodos base */
    for (const node of originalNodes) {
      const [createdNode] = await FlowNode.create([{
        account_id: req.user.account_id,
        flow_id: flowIdMap.get(String(node.flow_id))._id,

        node_type: node.node_type,
        content: node.content,

        order: node.order ?? 0,

        parent_node_id: node.parent_node_id
          ? nodeIdMap.get(String(node.parent_node_id)) || null
          : null,

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

    /* PASO 2 — reconstruir OPTIONS */
    for (const node of originalNodes) {
      if (!node.options?.length) continue;

      const newNodeId = nodeIdMap.get(String(node._id));
      const newNode = await FlowNode.findById(newNodeId).session(session);

      newNode.options = node.options.map(opt => ({
        label: opt.label,
        next_node_id: opt.next_node_id
          ? nodeIdMap.get(String(opt.next_node_id))
          : null
      }));

      await newNode.save({ session });
    }

    /* ───────── START NODE ───────── */
    for (const flow of originalFlows) {
      if (!flow.start_node_id) continue;

      const newFlow = flowIdMap.get(String(flow._id));

      newFlow.start_node_id =
        nodeIdMap.get(String(flow.start_node_id)) || null;

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


// Avatar disponibles
exports.getAvailableAvatars = async (req, res) => {
  try {
    const chatbot = await Chatbot.findOne({
      _id: req.params.id,
      account_id: req.user.account_id
    }).lean();

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    res.json({
      system: avatars,
      uploaded: chatbot.uploaded_avatars || [],
      active: chatbot.avatar
    });
  } catch (error) {
    console.error("GET AVATARS ERROR:", error);
    res.status(500).json({ message: "Error al obtener avatares" });
  }
};

// Eliminar Avatar 
exports.deleteAvatar = async (req, res) => {
  try {
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

    if (chatbot.avatar === avatarUrl) {
      chatbot.avatar = process.env.DEFAULT_CHATBOT_AVATAR || avatars[0]?.url;
    }

    await chatbot.save();

    res.json({
      message: "Avatar eliminado",
      avatar: chatbot.avatar,
      uploaded_avatars: chatbot.uploaded_avatars
    });
  } catch (error) {
    console.error("DELETE AVATAR ERROR:", error);
    res.status(500).json({ message: "Error al eliminar avatar" });
  }
};
