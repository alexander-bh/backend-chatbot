const ConversationSession = require("../models/ConversationSession");
const Flow = require("../models/Flow");
const FlowNode = require("../models/FlowNode");
const Chatbot = require("../models/Chatbot");
const upsertContactFromSession = require("../services/upsertContactFromSession.service");
const validateInput = require("../utils/validateInput");
const renderNode = require("../utils/renderNode");

const INPUT_NODES = ["text_input", "email", "phone", "number"];
const ALLOWED_MODES = ["preview", "production"];

// START CONVERSATION
exports.startConversation = async (req, res) => {
  try {
    const { chatbot_id, flow_id, mode = "production" } = req.body;

    if (!ALLOWED_MODES.includes(mode)) {
      return res.status(400).json({ message: "Mode inválido" });
    }

    const chatbot = await Chatbot.findOne({
      _id: chatbot_id,
      account_id: req.user.account_id
    });

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no válido" });
    }

    let flow;

    if (mode === "production") {
      flow = await Flow.findOne({
        chatbot_id,
        account_id: req.user.account_id,
        is_active: true
      });
    } else {
      if (!flow_id) {
        return res.status(400).json({
          message: "flow_id es obligatorio en preview"
        });
      }

      flow = await Flow.findOne({
        _id: flow_id,
        chatbot_id,
        account_id: req.user.account_id
      });
    }

    if (!flow || !flow.start_node_id) {
      return res.status(400).json({
        message:
          mode === "preview"
            ? "El flow no tiene nodo inicial configurado"
            : "No hay flow activo publicado"
      });
    }

    const node = await FlowNode.findOne({
      _id: flow.start_node_id,
      flow_id: flow._id,
      account_id: req.user.account_id
    });

    if (!node) {
      return res.status(500).json({ message: "Nodo inicial inválido" });
    }

    const session = await ConversationSession.create({
      account_id: req.user.account_id,
      chatbot_id,
      flow_id: flow._id,
      current_node_id: flow.start_node_id,
      variables: {},
      mode,
      is_completed: false
    });

    res.json(renderNode(node, session._id));

  } catch (error) {
    console.error("startConversation:", error);
    res.status(500).json({ message: "Error al iniciar conversación" });
  }
};

// NEXT STEP
exports.nextStep = async (req, res) => {
  try {
    const { session_id, input } = req.body;

    const session = await ConversationSession.findOne({
      _id: session_id,
      account_id: req.user.account_id,
      is_completed: false
    });

    if (!session) {
      return res.status(404).json({
        message: "Sesión inválida o finalizada"
      });
    }

    const currentNode = await FlowNode.findOne({
      _id: session.current_node_id,
      flow_id: session.flow_id,
      account_id: req.user.account_id
    });

    if (!currentNode) {
      return res.status(500).json({
        message: "Nodo actual no encontrado"
      });
    }

    let nextNodeId = null;
    const sanitizedInput =
      typeof input === "string" ? input.trim() : input;

    /* ───────────── OPTIONS ───────────── */
    if (currentNode.node_type === "options") {
      const index = Number(sanitizedInput);

      if (
        Number.isNaN(index) ||
        !Array.isArray(currentNode.options) ||
        !currentNode.options[index]
      ) {
        return res.status(400).json({ message: "Opción inválida" });
      }

      nextNodeId = currentNode.options[index].next_node_id;
    }

    /* ───────────── INPUT ───────────── */
    else if (INPUT_NODES.includes(currentNode.node_type)) {
      if (!sanitizedInput) {
        return res.status(400).json({ message: "Input requerido" });
      }

      if (currentNode.validation?.enabled) {
        const valid = validateInput(
          sanitizedInput,
          currentNode.validation.rules
        );
        if (!valid.ok) {
          return res.status(400).json({ message: valid.message });
        }
      }

      if (
        currentNode.variable_key &&
        session.mode === "production"
      ) {
        session.variables[currentNode.variable_key] = sanitizedInput;
      }

      nextNodeId = currentNode.next_node_id;
    }

    /* ───────────── SIMPLE NODES ───────────── */
    else if (
      ["text", "link", "jump"].includes(currentNode.node_type)
    ) {
      nextNodeId = currentNode.next_node_id;
    }

    /* ───────────── END ───────────── */
    if (!nextNodeId) {
      session.is_completed = true;
      await session.save();

      if (session.mode === "production") {
        await upsertContactFromSession(session);
      }

      return res.json({
        type: "end",
        message: "Conversación finalizada",
        captured: session.variables
      });
    }

    const nextNode = await FlowNode.findOne({
      _id: nextNodeId,
      flow_id: session.flow_id,
      account_id: req.user.account_id
    });

    if (!nextNode) {
      return res.status(500).json({
        message: "Siguiente nodo no encontrado"
      });
    }

    session.current_node_id = nextNodeId;
    await session.save();

    res.json(renderNode(nextNode, session._id));

  } catch (error) {
    console.error("nextStep:", error);
    res.status(500).json({
      message: "Error al procesar conversación"
    });
  }
};
