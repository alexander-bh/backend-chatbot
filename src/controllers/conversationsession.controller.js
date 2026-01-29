const mongoose = require("mongoose");
const ConversationSession = require("../models/ConversationSession");
const Flow = require("../models/Flow");
const FlowNode = require("../models/FlowNode");
const Chatbot = require("../models/Chatbot");
const upsertContactFromSession = require("../services/upsertContactFromSession.service");
const validateInput = require("../utils/validateInput");
const renderNode = require("../utils/renderNode");

const INPUT_NODES = ["question", "email", "phone", "number"];
const ALLOWED_MODES = ["preview", "production"];

/* --------------------------------------------------
   START CONVERSATION
-------------------------------------------------- */
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

    const startNode = await FlowNode.findOne({
      _id: flow.start_node_id,
      flow_id: flow._id,
      account_id: req.user.account_id
    });

    if (!startNode) {
      return res.status(500).json({ message: "Nodo inicial inválido" });
    }

    const session = await ConversationSession.create({
      account_id: req.user.account_id,
      chatbot_id,
      flow_id: flow._id,
      current_node_id: startNode._id,
      variables: {},
      mode,
      is_completed: false
    });

    res.json(renderNode(startNode, session._id));

  } catch (error) {
    console.error("startConversation:", error);
    res.status(500).json({ message: "Error al iniciar conversación" });
  }
};

/* --------------------------------------------------
   NEXT STEP
-------------------------------------------------- */
exports.nextStep = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { input } = req.body;

    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ message: "sessionId inválido" });
    }

    const session = await ConversationSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ message: "Sesión no encontrada" });
    }

    if (session.is_completed) {
      return res.json({ completed: true });
    }

    const currentNode = await FlowNode.findById(session.current_node_id);
    if (!currentNode) {
      throw new Error("Nodo actual no encontrado");
    }

    /* ---------- VALIDAR INPUT ---------- */
    if (INPUT_NODES.includes(currentNode.node_type)) {
      const error = validateInput(currentNode.node_type, input);
      if (error) {
        return res.status(400).json({ message: error });
      }
    }

    /* ---------- GUARDAR VARIABLE (solo production) ---------- */
    if (
      session.mode === "production" &&
      currentNode.variable_key
    ) {
      session.variables ??= {};
      session.variables[currentNode.variable_key] = String(input ?? "");
      session.markModified("variables");
    }

    /* ---------- FIN DE CONVERSACIÓN ---------- */
    if (
      currentNode.end_conversation === true ||
      !currentNode.next_node_id
    ) {
      session.is_completed = true;
      await session.save();

      if (session.mode === "production") {
        await upsertContactFromSession(session);
      }

      return res.json({
        completed: true,
        variables: session.variables
      });
    }

    /* ---------- SIGUIENTE NODO ---------- */
    const nextNode = await FlowNode.findById(currentNode.next_node_id);
    if (!nextNode) {
      throw new Error("Siguiente nodo no encontrado");
    }

    session.current_node_id = nextNode._id;
    await session.save();

    res.json(renderNode(nextNode, session._id));

  } catch (error) {
    console.error("nextStep:", error);
    res.status(500).json({
      message: "Error al procesar conversación"
    });
  }
};
