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
const ALLOWED_POSITIONS = [
  "bottom-right",
  "bottom-left",
  "middle-right",
  "middle-left",
  "top-right",
  "top-left"
];

/* ==================================================
   CREAR CHATBOT
================================================== */
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
        public_id: crypto.randomUUID(),
        name,
        welcome_message: welcomeText,
        status: "active"
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

/* ==================================================
   LISTAR CHATBOTS
================================================== */
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

/* ==================================================
   OBTENER CHATBOT POR ID
================================================== */
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

/* ==================================================
   DATA PARA EDITOR
================================================== */
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

        return { ...flow, nodes };
      })
    );

    res.json({ chatbot, flows: flowsWithNodes });
  } catch (error) {
    console.error("EDITOR DATA ERROR:", error);
    res.status(500).json({ message: "Error al cargar editor" });
  }
};

/* ==================================================
   ACTUALIZAR CHATBOT (MODELO PLANO)
================================================== */
exports.updateChatbot = async (req, res) => {
  try {
    const chatbot = await Chatbot.findOne({
      _id: req.params.id,
      account_id: req.user.account_id
    });

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    const body = req.body;

    const scalarFields = [
      "name",
      "welcome_message",
      "status",
      "primary_color",
      "secondary_color",
      "launcher_text",
      "is_enabled",
      "input_placeholder",
      "show_branding"
    ];

    for (const field of scalarFields) {
      if (body[field] !== undefined) {
        chatbot[field] = body[field];
      }
    }

    if (body.position !== undefined) {
      if (!ALLOWED_POSITIONS.includes(body.position)) {
        return res.status(400).json({ message: "position inválido" });
      }
      chatbot.position = body.position;
    }

    chatbot.uploaded_avatars ||= [];

    /* Avatar subido */
    if (req.file) {
      if (chatbot.uploaded_avatars.length >= MAX_AVATARS) {
        return res.status(400).json({
          message: `Límite de ${MAX_AVATARS} avatares alcanzado`
        });
      }

      const uploadedAvatar = {
        url: req.file.path,
        public_id: req.file.filename || req.file.public_id
      };

      const exists = chatbot.uploaded_avatars.some(
        a =>
          a.url === uploadedAvatar.url ||
          a.public_id === uploadedAvatar.public_id
      );

      if (!exists) chatbot.uploaded_avatars.push(uploadedAvatar);
      chatbot.avatar = uploadedAvatar.url;
    }

    /* Avatar por URL */
    if (body.avatar && !req.file) {
      const isSystem = avatars.some(a => a.url === body.avatar);
      const isUploaded = chatbot.uploaded_avatars.some(
        a => a.url === body.avatar
      );

      if (!isSystem && !isUploaded) {
        return res.status(400).json({ message: "Avatar inválido" });
      }

      chatbot.avatar = body.avatar;
    }

    await chatbot.save();
    res.json(chatbot);
  } catch (error) {
    console.error("UPDATE CHATBOT ERROR:", error);
    res.status(500).json({ message: "Error al actualizar chatbot" });
  }
};

/* ==================================================
   ELIMINAR CHATBOT
================================================== */
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

/* ==================================================
   DUPLICAR CHATBOT COMPLETO
================================================== */
exports.duplicateChatbotFull = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const original = await Chatbot.findOne({
      _id: req.params.id,
      account_id: req.user.account_id
    }).session(session);

    if (!original) {
      throw new Error("Chatbot no encontrado");
    }

    const baseName = getBaseName(original.name);
    const newName = await generateCopyName(
      baseName,
      req.user.account_id,
      session
    );

    const copy = original.toObject();
    delete copy._id;
    delete copy.__v;
    delete copy.created_at;

    copy.name = newName;
    copy.public_id = crypto.randomUUID();
    copy.uploaded_avatars = [];

    const [newChatbot] = await Chatbot.create([copy], { session });

    const flows = await Flow.find({
      chatbot_id: original._id
    }).session(session);

    const flowMap = new Map();

    for (const flow of flows) {
      const [newFlow] = await Flow.create(
        [{
          ...flow.toObject(),
          _id: undefined,
          chatbot_id: newChatbot._id,
          is_active: false,
          is_draft: true,
          start_node_id: null
        }],
        { session }
      );

      flowMap.set(String(flow._id), newFlow._id);
    }

    const nodes = await FlowNode.find({
      flow_id: { $in: [...flowMap.keys()] }
    }).session(session);

    const nodeMap = new Map();

    for (const node of nodes) {
      const payload = {
        ...node.toObject(),
        _id: undefined,
        flow_id: flowMap.get(String(node.flow_id)),
        next_node_id: null,
        is_draft: true
      };

      const [newNode] = await FlowNode.create([payload], { session });
      nodeMap.set(String(node._id), newNode._id);
    }

    for (const node of nodes) {
      const newNode = await FlowNode.findById(
        nodeMap.get(String(node._id))
      ).session(session);

      if (node.next_node_id) {
        newNode.next_node_id =
          nodeMap.get(String(node.next_node_id)) || null;
      }

      if (node.options?.length) {
        newNode.options = node.options.map(o => ({
          label: o.label,
          next_node_id: o.next_node_id
            ? nodeMap.get(String(o.next_node_id))
            : null
        }));
      }

      await newNode.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      message: "Chatbot duplicado correctamente",
      chatbot_id: newChatbot._id
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("DUPLICATE CHATBOT ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};

/* ==================================================
   AVATARES DISPONIBLES
================================================== */
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

/* ==================================================
   ELIMINAR AVATAR
================================================== */
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
      chatbot.avatar = process.env.DEFAULT_CHATBOT_AVATAR;
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
