// controllers/publicChatbot.controller.js
const ConversationSession = require("../models/ConversationSession");
const Flow = require("../models/Flow");
const FlowNode = require("../models/FlowNode");
const Chatbot = require("../models/Chatbot");
const renderNode = require("../utils/renderNode");

exports.startConversation = async (req, res) => {
  try {
    const { public_id } = req.params;

    /* ───────── CHATBOT ───────── */
    const chatbot = await Chatbot.findOne({
      public_id,
      status: "active"
    });

    if (!chatbot) {
      return res.status(404).json({
        message: "Chatbot no disponible"
      });
    }

    /* ───────── FLOW PUBLICADO ───────── */
    const flow = await Flow.findOne({
      chatbot_id: chatbot._id,
      is_active: true
    }).sort({ updatedAt: -1 });

    if (!flow || !flow.start_node_id) {
      return res.status(404).json({
        message: "Chatbot sin flujo activo"
      });
    }

    /* ───────── SESIÓN ───────── */
    const session = await ConversationSession.create({
      account_id: chatbot.account_id,
      chatbot_id: chatbot._id,
      flow_id: flow._id,
      current_node_id: flow.start_node_id,
      variables: {},
      mode: "production"
    });

    /* ───────── NODO INICIAL ───────── */
    const node = await FlowNode.findById(flow.start_node_id);
    if (!node) {
      return res.status(500).json({
        message: "Nodo inicial no encontrado"
      });
    }

    res.json(renderNode(node, session._id));
  } catch (error) {
    console.error("public startConversation error:", error);
    res.status(500).json({
      message: "Error al iniciar conversación"
    });
  }
};
