const Chatbot = require("../models/Chatbot");
const Flow = require("../models/Flow");
const FlowNode = require("../models/FlowNode");
const mongoose = require("mongoose");
const crypto = require("crypto");
const { getBaseName, generateCopyName } = require("../utils/chatbotName.helper");
const avatars = require("../config/chatbotAvatars");

/* --------------------------------------------------
   Utils
-------------------------------------------------- */
const normalizeSubdoc = v =>
  v && typeof v === "object" && Object.keys(v).length
    ? v
    : undefined;

const normalizeArray = v =>
  Array.isArray(v) && v.length ? v : undefined;

const ALLOWED_POSITIONS = [
  "bottom-right",
  "bottom-left",
  "middle-right",
  "middle-left",
  "top-right",
  "top-left"
];

/* --------------------------------------------------
   Crear chatbot
-------------------------------------------------- */
exports.createChatbot = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { name, welcome_message } = req.body;
    if (!name) {
      return res.status(400).json({ message: "El nombre es obligatorio" });
    }

    const welcomeText =
      welcome_message || "Hola 👋 ¿en qué puedo ayudarte?";

    const [chatbot] = await Chatbot.create(
      [{
        account_id: req.user.account_id,
        name,
        welcome_message: welcomeText,
        public_id: crypto.randomUUID(),
        status: "active",
        settings: {
          avatar: process.env.DEFAULT_CHATBOT_AVATAR,
          uploaded_avatars: [],
          primary_color: "#2563eb",
          secondary_color: "#111827",
          launcher_text: "¿Te ayudo?",
          position: "bottom-right",
          offset_x: 24,
          offset_y: 24,
          is_enabled: true
        }
      }],
      { session }
    );

    const [flow] = await Flow.create(
      [{
        account_id: req.user.account_id,
        chatbot_id: chatbot._id,
        name: "Flujo principal",
        is_active: false,
        is_draft: true,
        version: 1
      }],
      { session }
    );

    const [startNode] = await FlowNode.create(
      [{
        account_id: req.user.account_id,
        flow_id: flow._id,
        node_type: "text",
        content: welcomeText,
        position: { x: 100, y: 100 },
        is_draft: false
      }],
      { session }
    );

    flow.start_node_id = startNode._id;
    await flow.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({ chatbot, flow, start_node: startNode });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("CREATE CHATBOT ERROR:", error);
    res.status(500).json({ message: "Error al crear chatbot" });
  }
};

/* --------------------------------------------------
   Listar chatbots
-------------------------------------------------- */
exports.listChatbots = async (req, res) => {
  try {
    const chatbots = await Chatbot.find({
      account_id: req.user.account_id
    })
      .sort({ created_at: -1 })
      .select("name status public_id settings created_at")
      .lean();

    res.json(chatbots);
  } catch (error) {
    console.error("LIST CHATBOTS ERROR:", error);
    res.status(500).json({ message: "Error al listar chatbots" });
  }
};

/* --------------------------------------------------
   Obtener chatbot por ID
-------------------------------------------------- */
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

/* --------------------------------------------------
   Datos completos para editor
-------------------------------------------------- */
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
      chatbot_id: chatbot._id
    }).sort({ created_at: 1 }).lean();

    const flowsWithNodes = await Promise.all(
      flows.map(async flow => {
        const nodes = await FlowNode.find({
          flow_id: flow._id,
          account_id: req.user.account_id
        }).lean();

        return {
          ...flow,
          nodes
        };
      })
    );

    res.json({ chatbot, flows: flowsWithNodes });
  } catch (error) {
    console.error("EDITOR DATA ERROR:", error);
    res.status(500).json({ message: "Error al cargar editor" });
  }
};

/* --------------------------------------------------
   Actualizar chatbot + settings
-------------------------------------------------- */
exports.updateChatbot = async (req, res) => {
  try {
    const chatbot = await Chatbot.findOne({
      _id: req.params.id,
      account_id: req.user.account_id
    });

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    const { name, welcome_message, status, settings } = req.body;

    if (name !== undefined) chatbot.name = name;
    if (welcome_message !== undefined) chatbot.welcome_message = welcome_message;
    if (status !== undefined) chatbot.status = status;

    chatbot.settings ||= {};
    chatbot.settings.uploaded_avatars ||= [];

    /* ───────────── AVATAR SUBIDO (req.file) ───────────── */
    if (req.file) {
      if (chatbot.settings.uploaded_avatars.length >= MAX_AVATARS) {
        return res.status(400).json({
          message: `Límite de ${MAX_AVATARS} avatares alcanzado`
        });
      }

      const uploadedAvatar = {
        url: req.file.path,
        public_id: req.file.filename || req.file.public_id
      };

      const alreadyExists = chatbot.settings.uploaded_avatars.some(
        a =>
          a.url === uploadedAvatar.url ||
          a.public_id === uploadedAvatar.public_id
      );

      if (!alreadyExists) {
        chatbot.settings.uploaded_avatars.push(uploadedAvatar);
      }

      // Activar automáticamente el avatar subido
      chatbot.settings.avatar = uploadedAvatar.url;
    }

    /* ───────────── SETTINGS DESDE BODY ───────────── */
    if (
      settings &&
      typeof settings === "object" &&
      Object.keys(settings).length
    ) {
      if (
        settings.position &&
        !ALLOWED_POSITIONS.includes(settings.position)
      ) {
        return res.status(400).json({ message: "position inválido" });
      }

      const allowedSettings = [
        "avatar",
        "primary_color",
        "secondary_color",
        "launcher_text",
        "position",
        "offset_x",
        "offset_y",
        "is_enabled",
        "input_placeholder",
        "show_branding"
      ];

      for (const key of allowedSettings) {
        if (settings[key] === undefined) continue;

        if (["offset_x", "offset_y"].includes(key)) {
          if (typeof settings[key] !== "number") continue;
        }

        // Avatar por URL (solo sistema o subidos)
        if (key === "avatar" && !req.file) {
          const isSystem = avatars.some(a => a.url === settings.avatar);
          const isUploaded = chatbot.settings.uploaded_avatars.some(
            a => a.url === settings.avatar
          );

          if (!isSystem && !isUploaded) {
            return res.status(400).json({ message: "Avatar inválido" });
          }
        }

        chatbot.settings[key] = settings[key];
      }
    }

    await chatbot.save();
    res.json(chatbot);

  } catch (error) {
    console.error("UPDATE CHATBOT ERROR:", error);
    res.status(500).json({ message: "Error al actualizar chatbot" });
  }
};

/* --------------------------------------------------
   Eliminar chatbot
-------------------------------------------------- */
exports.deleteChatbot = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const chatbot = await Chatbot.findOne({
      _id: req.params.id,
      account_id: req.user.account_id
    }).session(session);

    if (!chatbot) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    const flows = await Flow.find({
      chatbot_id: chatbot._id
    }).session(session);

    const flowIds = flows.map(f => f._id);

    await FlowNode.deleteMany({ flow_id: { $in: flowIds } }, { session });
    await Flow.deleteMany({ chatbot_id: chatbot._id }, { session });
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
/* --------------------------------------------------
   Duplicar chatbot completamente
-------------------------------------------------- */
exports.duplicateChatbotFull = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const accountId = req.user.account_id;

    const originalChatbot = await Chatbot.findOne({
      _id: id,
      account_id: accountId
    }).session(session);

    if (!originalChatbot) {
      throw new Error("Chatbot no encontrado");
    }

    const baseName = getBaseName(originalChatbot.name);
    const newName = await generateCopyName(baseName, accountId, session);

    const original = originalChatbot.toObject();
    delete original._id;
    delete original.__v;
    delete original.created_at;
    original.settings.uploaded_avatars = [];

    const [newChatbot] = await Chatbot.create(
      [{
        ...original,
        name: newName,
        public_id: crypto.randomUUID(),
        created_at: new Date()
      }],
      { session }
    );

    const flows = await Flow.find({
      chatbot_id: originalChatbot._id
    }).session(session);

    const flowIdMap = new Map();
    const flowStartNodeMap = new Map();

    for (const flow of flows) {
      const [newFlow] = await Flow.create(
        [{
          account_id: accountId,
          chatbot_id: newChatbot._id,
          name: flow.name,
          description: flow.description,
          is_active: false,
          is_draft: true,
          start_node_id: null,
          version: flow.version ?? 1
        }],
        { session }
      );

      flowIdMap.set(String(flow._id), newFlow._id);
      flowStartNodeMap.set(String(flow._id), String(flow.start_node_id));
    }

    const nodes = await FlowNode.find({
      flow_id: { $in: [...flowIdMap.keys()] }
    }).session(session);

    const nodeIdMap = new Map();

    for (const node of nodes) {
      const payload = {
        account_id: accountId,
        flow_id: flowIdMap.get(String(node.flow_id)),
        node_type: node.node_type,
        content: node.content,
        variable_key: node.variable_key,
        crm_field_key: node.crm_field_key,
        typing_time: node.typing_time,
        position: node.position || { x: 0, y: 0 },
        next_node_id: null,
        is_draft: true
      };

      const options = normalizeArray(
        node.options?.map(o => ({ label: o.label, next_node_id: null }))
      );

      if (options) payload.options = options;
      if (node.node_type === "link")
        payload.link_action = normalizeSubdoc(node.link_action);
      if (["question", "email", "phone", "number"].includes(node.node_type))
        payload.validation = normalizeSubdoc(node.validation);

      const [newNode] = await FlowNode.create([payload], { session });
      nodeIdMap.set(String(node._id), newNode._id);

      if (String(node._id) === flowStartNodeMap.get(String(node.flow_id))) {
        await Flow.updateOne(
          { _id: payload.flow_id },
          { start_node_id: newNode._id },
          { session }
        );
      }
    }

    for (const node of nodes) {
      const newNode = await FlowNode.findById(
        nodeIdMap.get(String(node._id))
      ).session(session);

      if (node.next_node_id) {
        newNode.next_node_id =
          nodeIdMap.get(String(node.next_node_id)) || null;
      }

      if (node.options?.length) {
        newNode.options = node.options.map(o => ({
          label: o.label,
          next_node_id: o.next_node_id
            ? nodeIdMap.get(String(o.next_node_id))
            : null
        }));
      }

      await newNode.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      message: "Chatbot duplicado completamente",
      chatbot_id: newChatbot._id
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("DUPLICATE FULL ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};

// Eliminar avatar 
exports.deleteAvatar = async (req, res) => {
  try {
    const chatbot = await Chatbot.findOne({
      _id: req.params.id,
      account_id: req.user.account_id
    });

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    chatbot.settings ||= {};
    chatbot.settings.uploaded_avatars ||= [];

    const { avatarUrl } = req.body;
    if (!avatarUrl) {
      return res.status(400).json({ message: "avatarUrl requerido" });
    }

    const isSystemAvatar = avatars.some(a => a.url === avatarUrl);
    if (isSystemAvatar) {
      return res.status(400).json({
        message: "No se puede eliminar un avatar del sistema"
      });
    }

    const before = chatbot.settings.uploaded_avatars.length;

    chatbot.settings.uploaded_avatars =
      chatbot.settings.uploaded_avatars.filter(a => a.url !== avatarUrl);

    if (before === chatbot.settings.uploaded_avatars.length) {
      return res.status(404).json({ message: "Avatar no encontrado" });
    }

    if (chatbot.settings.avatar === avatarUrl) {
      chatbot.settings.avatar = process.env.DEFAULT_CHATBOT_AVATAR;
    }

    await chatbot.save();

    res.json({
      message: "Avatar eliminado",
      avatar: chatbot.settings.avatar,
      uploaded_avatars: chatbot.settings.uploaded_avatars
    });

  } catch (error) {
    console.error("DELETE AVATAR ERROR:", error);
    res.status(500).json({ message: "Error al eliminar avatar" });
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
      uploaded: chatbot.settings?.uploaded_avatars || [],
      active: chatbot.settings?.avatar
    });

  } catch (error) {
    console.error("GET AVATARS ERROR:", error);
    res.status(500).json({ message: "Error al obtener avatares" });
  }
};