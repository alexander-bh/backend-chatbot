const ConversationSession = require("../models/ConversationSession");
const Flow = require("../models/Flow");
const FlowNode = require("../models/FlowNode");
const Chatbot = require("../models/Chatbot");
const INPUT_NODES = ["question", "email", "phone", "number"];
const upsertContactFromSession = require("../services/upsertContactFromSession.service");

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
      current_node_id: flow.start_node_id
    });

    const node = await FlowNode.findById(flow.start_node_id);

    res.json(renderNode(node, session._id));
  } catch (error) {
    console.error("startConversation error:", error);
    res.status(500).json({ message: "Error al iniciar conversación" });
  }
};

exports.nextStep = async (req, res) => {
  try {
    const { session_id, input } = req.body;

    const session = await ConversationSession.findOne({
      _id: session_id,
      account_id: req.user.account_id,
      is_completed: false
    });

    if (!session) {
      return res.status(404).json({ message: "Sesión inválida" });
    }

    const currentNode = await FlowNode.findById(session.current_node_id);
    if (!currentNode) {
      return res.status(500).json({ message: "Nodo actual no encontrado" });
    }

    let nextNodeId = null;

    // 🔹 NODO DE OPCIONES
    if (currentNode.node_type === "options") {
      const selected = currentNode.options?.[input];

      if (!selected || !selected.next_node_id) {
        return res.status(400).json({ message: "Opción inválida" });
      }

      nextNodeId = selected.next_node_id;
    }

    // 🔹 NODOS DE INPUT
    else if (INPUT_NODES.includes(currentNode.node_type)) {
      if (!input) {
        return res.status(400).json({ message: "Input requerido" });
      }

      if (currentNode.variable_key) {
        session.variables[currentNode.variable_key] = input;
      }

      nextNodeId = currentNode.next_node_id;
    }

    // 🔹 TEXTO SIMPLE
    else if (currentNode.node_type === "text") {
      nextNodeId = currentNode.next_node_id;
    }

    // 🔚 FIN DE FLUJO
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

    res.json(renderNode(nextNode, session._id));
  } catch (error) {
    console.error("nextStep error:", error);
    res.status(500).json({ message: "Error al procesar conversación" });
  }
};

const renderNode = (node, session_id) => {
  const payload = {
    session_id,
    node_id: node._id,
    type: node.node_type,
    content: node.content || null,
    input_type: node.node_type
  };

  if (node.node_type === "options") {
    payload.options = node.options.map((opt, index) => ({
      index,
      label: opt.label
    }));
  }

  return payload;
};
