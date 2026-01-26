const ConversationSession = require("../models/ConversationSession");
const Flow = require("../models/Flow");
const FlowNode = require("../models/FlowNode");
const Chatbot = require("../models/Chatbot");
const upsertContactFromSession = require("../services/upsertContactFromSession.service");
const validateInput = require("../utils/validateInput");
const renderNode = require("../utils/renderNode");

const INPUT_NODES = ["question", "email", "phone", "number"];

// Conmensar conversación
exports.startConversation = async (req, res) => {
  try {
    const { chatbot_id } = req.body;

    const chatbot = await Chatbot.findOne({
      _id: chatbot_id,
      account_id: req.user.account_id,
      status: "active"
    });

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no válido" });
    }

    const flow = await Flow.findOne({
      chatbot_id,
      is_active: true
    });

    if (!flow || !flow.start_node_id) {
      return res.status(404).json({
        message: "No hay flujo activo configurado"
      });
    }

    const session = await ConversationSession.create({
      account_id: req.user.account_id,
      chatbot_id,
      flow_id: flow._id,
      current_node_id: flow.start_node_id,
      variables: {}
    });

    const node = await FlowNode.findById(flow.start_node_id);
    if (!node) {
      return res.status(500).json({ message: "Nodo inicial no encontrado" });
    }

    res.json(renderNode(node, session._id));
  } catch (error) {
    console.error("startConversation error:", error);
    res.status(500).json({ message: "Error al iniciar conversación" });
  }
};

// Finalizar conversación
exports.nextStep = async (req, res) => {
  try {
    const { session_id, input } = req.body;

    const session = await ConversationSession.findOne({
      _id: session_id,
      account_id: req.user.account_id,
      is_completed: false
    });

    if (!session) {
      return res.status(404).json({ message: "Sesión inválida o finalizada" });
    }

    const currentNode = await FlowNode.findById(session.current_node_id);
    if (!currentNode) {
      return res.status(500).json({ message: "Nodo actual no encontrado" });
    }

    let nextNodeId = null;
    const sanitizedInput =
      typeof input === "string" ? input.trim() : input;

    // ================= OPTIONS =================
    if (currentNode.node_type === "options") {
      const index = Number(sanitizedInput);

      if (
        Number.isNaN(index) ||
        !currentNode.options ||
        !currentNode.options[index]
      ) {
        return res.status(400).json({ message: "Opción inválida" });
      }

      nextNodeId = currentNode.options[index].next_node_id;
    }

    // ================= INPUT =================
    else if (INPUT_NODES.includes(currentNode.node_type)) {
      if (!sanitizedInput) {
        return res.status(400).json({ message: "Input requerido" });
      }

      // 🔐 Validaciones
      if (currentNode.validation?.enabled) {
        const valid = validateInput(
          sanitizedInput,
          currentNode.validation.rules
        );
        if (!valid.ok) {
          return res.status(400).json({ message: valid.message });
        }
      }

      if (currentNode.variable_key) {
        session.variables[currentNode.variable_key] = sanitizedInput;
      }

      nextNodeId = currentNode.next_node_id;
    }

    // ================= TEXT =================
    else if (currentNode.node_type === "text") {
      nextNodeId = currentNode.next_node_id;
    }

    // ================= LINK =================
    else if (currentNode.node_type === "link") {
      nextNodeId = currentNode.next_node_id;
    }

    // ================= JUMP =================
    else if (currentNode.node_type === "jump") {
      nextNodeId = currentNode.next_node_id;
    }

    // ================= END =================
    if (!nextNodeId) {
      session.is_completed = true;
      await session.save();

      await upsertContactFromSession(session);

      return res.json({
        type: "end",
        message: "Conversación finalizada",
        captured: session.variables
      });
    }

    session.current_node_id = nextNodeId;
    await session.save();

    const nextNode = await FlowNode.findById(nextNodeId);
    if (!nextNode) {
      return res.status(500).json({ message: "Siguiente nodo no encontrado" });
    }

    res.json(renderNode(nextNode, session._id));
  } catch (error) {
    console.error("nextStep error:", error);
    res.status(500).json({ message: "Error al procesar conversación" });
  }
};
