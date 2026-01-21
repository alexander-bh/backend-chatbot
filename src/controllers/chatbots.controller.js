const Chatbot = require("../models/Chatbot");
const ChatbotSettings = require("../models/ChatbotSettings");
const Flow = require("../models/Flow");
const FlowNode = require("../models/FlowNode");
const mongoose = require("mongoose");
const crypto = require("crypto");

// Crear un nuevo chatbot
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

    const chatbot = await Chatbot.create(
      [{
        account_id: req.user.account_id,
        name,
        welcome_message: welcomeText,
        public_id: crypto.randomUUID()
      }],
      { session }
    );

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

    const flow = await Flow.create(
      [{
        account_id: req.user.account_id,   // ✅ OBLIGATORIO
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
        account_id: req.user.account_id,  // ✅ OBLIGATORIO
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

//Listar los chatbot 
exports.listChatbots = async (req, res) => {
  try {
    const chatbots = await Chatbot.find({
      account_id: req.user.account_id
    })
      .sort({ created_at: -1 })
      .lean();

    const chatbotIds = chatbots.map(bot => bot._id);

    const settings = await ChatbotSettings.find({
      chatbot_id: { $in: chatbotIds }
    }).select("chatbot_id avatar");

    const settingsMap = {};
    settings.forEach(s => {
      settingsMap[s.chatbot_id.toString()] = s;
    });
    
    const result = chatbots.map(bot => ({
      ...bot,
      settings: settingsMap[bot._id.toString()] || {
        avatar: process.env.DEFAULT_CHATBOT_AVATAR
      }
    }));

    res.json(result);

  } catch (error) {
    console.error("LIST CHATBOTS ERROR:", error);
    res.status(500).json({
      message: "Error al listar chatbots"
    });
  }
};


// Obtener chatbot por ID
exports.getChatbotById = async (req, res) => {
  try {
    const chatbot = await Chatbot.findOne({
      _id: req.params.id,
      account_id: req.user.account_id
    });

    if (!chatbot) {
      return res.status(404).json({
        message: "Chatbot no encontrado"
      });
    }

    res.json(chatbot);
  } catch (error) {
    console.error("GET CHATBOT ERROR:", error);
    res.status(500).json({
      message: "Error al obtener chatbot"
    });
  }
};

// Obtener chatbot por ID con settings básicos
exports.getChatbotById = async (req, res) => {
  try {
    const chatbot = await Chatbot.findOne({
      _id: req.params.id,
      account_id: req.user.account_id
    }).lean();

    if (!chatbot) {
      return res.status(404).json({
        message: "Chatbot no encontrado"
      });
    }

    // 🔹 Buscar settings
    const settings = await ChatbotSettings.findOne({
      chatbot_id: chatbot._id
    }).select("avatar welcome_message -_id");

    res.json({
      ...chatbot,
      settings: settings || {
        avatar: process.env.DEFAULT_CHATBOT_AVATAR,
        welcome_message: "¡Hola! ¿Cómo puedo ayudarte?"
      }
    });

  } catch (error) {
    console.error("GET CHATBOT ERROR:", error);
    res.status(500).json({
      message: "Error al obtener chatbot"
    });
  }
};



// Obtener datos completos para el editor
exports.getChatbotEditorData = async (req, res) => {
  try {
    const chatbot = await Chatbot.findOne({
      _id: req.params.id,
      account_id: req.user.account_id
    });

    if (!chatbot) {
      return res.status(404).json({
        message: "Chatbot no encontrado"
      });
    }

    const flows = await Flow.find({
      chatbot_id: chatbot._id
    }).sort({ created_at: 1 });

    const flowsWithNodes = await Promise.all(
      flows.map(async flow => {
        const nodes = await FlowNode.find({
          flow_id: flow._id
        });

        return {
          ...flow.toObject(),
          nodes
        };
      })
    );

    res.json({
      chatbot,
      flows: flowsWithNodes
    });

  } catch (error) {
    console.error("EDITOR DATA ERROR:", error);
    res.status(500).json({
      message: "Error al cargar editor"
    });
  }
};

//Actalizar chatbot 
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

// Eliminar chatbot
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

    /* ─────────────── CHATBOT ORIGINAL ─────────────── */
    const originalChatbot = await Chatbot.findOne({
      _id: id,
      account_id: accountId
    }).session(session);

    if (!originalChatbot) {
      throw new Error("Chatbot no encontrado");
    }

    /* ─────────────── NUEVO CHATBOT ─────────────── */
    const [newChatbot] = await Chatbot.create(
      [{
        account_id: accountId,
        name: `${originalChatbot.name} (Copia)`,
        welcome_message: originalChatbot.welcome_message,
        status: "draft",
        public_id: crypto.randomUUID()
      }],
      { session }
    );

    /* ─────────────── SETTINGS ─────────────── */
    const settings = await ChatbotSettings.findOne({
      chatbot_id: originalChatbot._id
    }).session(session);

    if (settings) {
      await ChatbotSettings.create(
        [{
          chatbot_id: newChatbot._id,
          avatar: settings.avatar,
          primary_color: settings.primary_color,
          secondary_color: settings.secondary_color,
          launcher_text: settings.launcher_text,
          bubble_style: settings.bubble_style,
          font: settings.font,
          position: settings.position,
          is_enabled: settings.is_enabled
        }],
        { session }
      );
    }

    /* ─────────────── FLOWS ─────────────── */
    const flows = await Flow.find({
      chatbot_id: originalChatbot._id
    }).session(session);

    const flowIdMap = new Map();

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
    }

    /* ─────────────── NODOS (SIN CONEXIONES) ─────────────── */
    const nodes = await FlowNode.find({
      flow_id: { $in: [...flowIdMap.keys()] }
    }).session(session);

    const nodeIdMap = new Map();

    for (const node of nodes) {
      const [newNode] = await FlowNode.create(
        [{
          account_id: accountId,
          chatbot_id: newChatbot._id,
          flow_id: flowIdMap.get(String(node.flow_id)),
          node_type: node.node_type,
          content: node.content,
          variable_key: node.variable_key,
          crm_field_key: node.crm_field_key,
          validation: node.validation,
          link_action: node.link_action,
          typing_time: node.typing_time,
          position: node.position,
          options: node.options?.map(opt => ({
            label: opt.label,
            next_node_id: null
          })) || [],
          next_node_id: null,
          is_draft: true
        }],
        { session }
      );

      nodeIdMap.set(String(node._id), newNode._id);
    }

    /* ─────────────── RECONSTRUIR CONEXIONES ─────────────── */
    for (const node of nodes) {
      const newNodeId = nodeIdMap.get(String(node._id));
      const newNode = await FlowNode.findById(newNodeId).session(session);

      if (node.next_node_id) {
        newNode.next_node_id =
          nodeIdMap.get(String(node.next_node_id)) || null;
      }

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

    /* ─────────────── COMMIT ─────────────── */
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
    res.status(500).json({
      message: error.message || "Error al duplicar chatbot"
    });
  }
};
