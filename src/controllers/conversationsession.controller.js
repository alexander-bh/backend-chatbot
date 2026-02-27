//conversationsession.controller
const mongoose = require("mongoose");
const ConversationSession = require("../models/ConversationSession");
const Flow = require("../models/Flow");
const FlowNode = require("../models/FlowNode");
const Chatbot = require("../models/Chatbot");
const upsertContactFromSession = require("../services/upsertContactFromSession.service");
const renderNode = require("../utils/renderNode");
const executeNodeNotification = require("../services/executeNodeNotification.service");
const validateNodeInput = require("../utils/chat/chatbotValidationEngine");

const ALLOWED_MODES = ["preview", "production"];

/* --------------------------------------------------
   START CONVERSATION
-------------------------------------------------- */
exports.startConversation = async (req, res) => {
  try {

    const { chatbot_id, flow_id, mode = "production", origin_url } = req.body;

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
        status: "published"
      }).sort({ version: -1 });

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
      origin_url, // 🔥 aquí
      mode,
      is_completed: false,
      history: [
        {
          node_id: startNode._id,
          question: startNode.content,
          node_type: startNode.node_type
        }
      ]
    });

    return res.json(renderNode(startNode, session._id));

  } catch (error) {

    console.error("startConversation:", error);

    return res.status(500).json({
      message: "Error al iniciar conversación"
    });
  }
};

/* --------------------------------------------------
   NEXT STEP (ENGINE)
-------------------------------------------------- */
exports.nextStep = async (req, res) => {
  try {
    const { id: sessionId } = req.params;
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

    /* ================= LOAD FLOW GRAPH ================= */

    const nodes = await FlowNode.find({
      flow_id: session.flow_id,
      account_id: session.account_id
    }).lean();

    const nodesMap = new Map(nodes.map(n => [String(n._id), n]));

    let currentNode = nodesMap.get(String(session.current_node_id));
    if (!currentNode) {
      throw new Error("Nodo actual no encontrado");
    }

    const TEXT_INPUT_NODES = [
      "question",
      "email",
      "phone",
      "number",
      "text_input"
    ];

    /* ================= FIRST RENDER (NO INPUT) ================= */

    if (
      TEXT_INPUT_NODES.includes(currentNode.node_type) &&
      input === undefined
    ) {
      return res.json(renderNode(currentNode, session._id));
    }

    /* ================= SAVE INPUT + HISTORY ================= */

    if (
      TEXT_INPUT_NODES.includes(currentNode.node_type) &&
      input !== undefined
    ) {
      const errors = validateNodeInput(currentNode, input);
      if (errors.length > 0) {
        return res.json({
          session_id: session._id,
          node_id: currentNode._id,
          type: currentNode.node_type,
          validation_error: true,
          message: errors[0],
          input_type: currentNode.node_type,
          validation: currentNode.validation,
          completed: false
        });
      }

      // Guardar variable
      if (session.mode === "production" && currentNode.variable_key) {
        session.variables[currentNode.variable_key] = String(input);
        session.markModified("variables");
      }

      // 🔥 GUARDAR HISTORIAL
      session.history.push({
        node_id: currentNode._id,
        question: currentNode.content,
        answer: String(input),
        node_type: currentNode.node_type,
        variable_key: currentNode.variable_key
      });

      session.markModified("history");

      await session.save();
    }

    /* ================= NEXT NODE RESOLUTION ================= */

    const resolveNextNode = (node) => {

      if (
        (node.node_type === "options" || node.node_type === "policy") &&
        input !== undefined
      ) {
        const sourceArray =
          node.node_type === "options"
            ? node.options
            : node.policy;

        const match = sourceArray.find(opt =>
          String(opt.value) === String(input) ||
          String(opt.label) === String(input)
        );

        if (!match) return null;

        session.current_branch_id = match.next_branch_id || null;

        if (match.next_node_id) {
          return nodesMap.get(String(match.next_node_id));
        }

        return null;
      }

      if (node.next_node_id) {

        const candidate = nodesMap.get(String(node.next_node_id));
        if (!candidate) return null;

        if (candidate.branch_id) {
          if (candidate.branch_id === session.current_branch_id) {
            return candidate;
          }
          return null;
        }

        return candidate;
      }

      return null;
    };

    let nextNode = resolveNextNode(currentNode);

    /* ================= SAFE TERMINATION ================= */

    if (!nextNode) {

      if (currentNode.end_conversation) {

        session.is_completed = true;
        session.current_branch_id = null;

        await session.save();

        if (session.mode === "production") {
          await upsertContactFromSession(session);
        }

        return res.json({ completed: true });
      }

      return res.json(renderNode(currentNode, session._id));
    }

    /* ================= ADVANCE ================= */

    session.current_node_id = nextNode._id;

    if (!nextNode.branch_id) {
      session.current_branch_id = null;
    }

    /* ================= SAVE NON-INPUT NODE HISTORY ================= */

    if (!TEXT_INPUT_NODES.includes(nextNode.node_type)) {
      const lastHistory = session.history[session.history.length - 1];

      if (!lastHistory || String(lastHistory.node_id) !== String(nextNode._id)) {
        session.history.push({
          node_id: nextNode._id,
          question: nextNode.content,
          node_type: nextNode.node_type
        });
      }

      session.markModified("history");
    }

    /* ================= NOTIFICATIONS ================= */

    if (nextNode.meta?.notify?.enabled && session.mode === "production") {
      await executeNodeNotification(nextNode, session);
    }

    /* ================= END FLAG ================= */

    if (nextNode.end_conversation) {
      session.is_completed = true;
      session.current_branch_id = null;

      if (session.mode === "production") {
        await upsertContactFromSession(session);
      }
    }

    await session.save();

    return res.json(renderNode(nextNode, session._id));

  } catch (error) {
    console.error("nextStep:", error);
    return res.status(500).json({
      message: "Error al procesar conversación"
    });
  }
};
