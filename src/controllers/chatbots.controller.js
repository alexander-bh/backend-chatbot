const Chatbot = require("../models/Chatbot");
const ChatbotSettings = require("../models/ChatbotSettings");
const Flow = require("../models/Flow");
const FlowNode = require("../models/FlowNode");
const mongoose = require("mongoose");
const crypto = require("crypto");

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

    // 1️⃣ Crear Chatbot
    const chatbot = await Chatbot.create(
      [{
        account_id: req.user.account_id,
        name,
        welcome_message: welcomeText, // opcional mantenerlo
        public_id: crypto.randomUUID()
      }],
      { session }
    );

    // 2️⃣ Crear Settings
    await ChatbotSettings.create(
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

    // 3️⃣ Crear Flow inicial
    const flow = await Flow.create(
      [{
        chatbot_id: chatbot[0]._id,
        name: "Flujo principal",
        is_default: true
      }],
      { session }
    );

    // 4️⃣ Crear nodo inicial usando welcome_message
    const startNode = await FlowNode.create(
      [{
        flow_id: flow[0]._id,
        node_type: "text",
        content: welcomeText,
        next_node_id: null,
        position: { x: 100, y: 100 },
        is_draft: false
      }],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      chatbot: chatbot[0],
      flow: flow[0],
      start_node: startNode[0]
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error("CREATE CHATBOT ERROR:", error);
    res.status(500).json({ message: "Error al crear chatbot" });
  }
};

exports.listChatbots = async (req, res) => {
  const chatbots = await Chatbot.find({
    account_id: req.user.account_id
  }).sort({ created_at: -1 });

  res.json(chatbots);
};

exports.updateChatbot = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, welcome_message, status } = req.body;

    const chatbot = await Chatbot.findOne({
      _id: id,
      account_id: req.user.account_id
    });

    if (!chatbot) {
      return res.status(404).json({
        message: "Chatbot no encontrado"
      });
    }

    if (name !== undefined) chatbot.name = name;
    if (welcome_message !== undefined) chatbot.welcome_message = welcome_message;
    if (status !== undefined) chatbot.status = status;

    await chatbot.save();

    res.json(chatbot);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


exports.deleteChatbot = async (req, res) => {
  try {
    const { id } = req.params;

    const chatbot = await Chatbot.findOneAndDelete({
      _id: id,
      account_id: req.user.account_id
    });

    if (!chatbot) {
      return res.status(404).json({
        message: "Chatbot no encontrado"
      });
    }

    res.json({
      message: "Chatbot eliminado correctamente"
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.duplicateChatbotFull = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const accountId = req.user.account_id;

    // Chatbot original
    const originalChatbot = await Chatbot.findOne({
      _id: id,
      account_id: accountId
    }).session(session);

    if (!originalChatbot) {
      throw new Error("Chatbot no encontrado");
    }

    // Crear nuevo chatbot
    const newChatbot = await Chatbot.create([{
      account_id: accountId,
      name: `${originalChatbot.name} (Copia)`,
      welcome_message: originalChatbot.welcome_message,
      status: "draft",
      public_id: crypto.randomUUID()
    }], { session });

    const newChatbotId = newChatbot[0]._id;

    // Copiar settings
    const settings = await ChatbotSettings.findOne({
      chatbot_id: originalChatbot._id
    }).session(session);

    if (settings) {
      await ChatbotSettings.create([{
        chatbot_id: newChatbotId,
        avatar: settings.avatar,
        primary_color: settings.primary_color,
        secondary_color: settings.secondary_color,
        launcher_text: settings.launcher_text,
        bubble_style: settings.bubble_style,
        font: settings.font,
        position: settings.position,
        is_enabled: settings.is_enabled
      }], { session });
    }

    // Copiar flows
    const flows = await Flow.find({
      chatbot_id: originalChatbot._id
    }).session(session);

    const flowIdMap = new Map();

    for (const flow of flows) {
      const newFlow = await Flow.create([{
        chatbot_id: newChatbotId,
        name: flow.name,
        description: flow.description,
        is_active: false
      }], { session });

      flowIdMap.set(String(flow._id), newFlow[0]._id);
    }

    // Copiar nodos SIN conexiones
    const nodes = await FlowNode.find({
      flow_id: { $in: [...flowIdMap.keys()] }
    }).session(session);

    const nodeIdMap = new Map();

    for (const node of nodes) {
      const newNode = await FlowNode.create([{
        flow_id: flowIdMap.get(String(node.flow_id)),
        node_type: node.node_type,
        content: node.content,
        variable_key: node.variable_key,
        position: node.position,
        options: node.options?.map(opt => ({
          label: opt.label,
          next_node_id: null
        })) || [],
        next_node_id: null,
        is_draft: true
      }], { session });

      nodeIdMap.set(String(node._id), newNode[0]._id);
    }

    // Reconstruir conexiones
    for (const node of nodes) {
      const newNodeId = nodeIdMap.get(String(node._id));
      const newNode = await FlowNode.findById(newNodeId).session(session);

      // conexiones lineales
      if (node.next_node_id) {
        newNode.next_node_id = nodeIdMap.get(String(node.next_node_id)) || null;
      }

      // opciones
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

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      message: "Chatbot duplicado completamente",
      chatbot_id: newChatbotId
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error("DUPLICATE FULL ERROR:", error);
    res.status(500).json({
      message: error.message || "Error al duplicar chatbot"
    });
  }
};