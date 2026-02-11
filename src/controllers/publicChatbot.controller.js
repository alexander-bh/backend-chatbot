//controllers/publicChatbot.controller
const mongoose = require("mongoose");
const ConversationSession = require("../models/ConversationSession");
const Flow = require("../models/Flow");
const FlowNode = require("../models/FlowNode");
const Chatbot = require("../models/Chatbot");
const renderNode = require("../utils/renderNode");
const engine = require("./conversationsession.controller");

// controllers/conversation.controller.js
exports.startConversation = async (req, res) => {
  try {
    const { public_id } = req.params;

    const chatbot = await Chatbot.findOne({
      public_id,
      status: "active"
    });

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no disponible" });
    }

    const flow = await Flow.findOne({
      chatbot_id: chatbot._id,
      account_id: chatbot.account_id,
      status: "active"
    }).sort({ published_at: -1 });

    if (!flow || !flow.start_node_id) {
      return res.status(404).json({
        message: "Chatbot sin flujo publicado"
      });
    }

    const startNode = await FlowNode.findOne({
      _id: flow.start_node_id,
      flow_id: flow._id,
      account_id: chatbot.account_id,
      is_draft: false
    });

    if (!startNode) {
      return res.status(500).json({
        message: "Nodo inicial inválido"
      });
    }

    const session = await ConversationSession.create({
      account_id: chatbot.account_id,
      chatbot_id: chatbot._id,
      flow_id: flow._id,
      current_node_id: startNode._id,
      variables: {},
      mode: "production",
      is_completed: false
    });

    return res.json(renderNode(startNode, session._id));

  } catch (error) {
    console.error("startConversation error:", error);
    return res.status(500).json({
      message: "Error al iniciar conversación"
    });
  }
};

exports.nextPublicStep = async (req, res) => {
  try {
    const { session_id } = req.params;
    const { input } = req.body;

    if (!mongoose.Types.ObjectId.isValid(session_id)) {
      return res.status(400).json({ message: "session_id inválido" });
    }

    const session = await ConversationSession.findById(session_id);
    if (!session || session.is_completed) {
      return res.json({ completed: true });
    }

    if (session.mode !== "production") {
      return res.status(403).json({ message: "Sesión inválida" });
    }

    const fakeReq = {
      params: { id: session_id },
      body: { input }
    };

    return engine.nextStep(fakeReq, res);

  } catch (err) {
    console.error("nextPublicStep:", err);
    return res.status(500).json({
      message: "Error en conversación pública"
    });
  }
};