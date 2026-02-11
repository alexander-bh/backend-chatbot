//conversationsession.controller
const mongoose = require("mongoose");
const ConversationSession = require("../models/ConversationSession");
const Flow = require("../models/Flow");
const FlowNode = require("../models/FlowNode");
const Chatbot = require("../models/Chatbot");
const upsertContactFromSession = require("../services/upsertContactFromSession.service");
const validateInput = require("../utils/validateInput");
const renderNode = require("../utils/renderNode");
const executeNodeNotification = require("../services/executeNodeNotification.service");

const INPUT_NODES = ["question", "email", "phone", "number", "text_input"];
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
        status: "draft"
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

    /* ─────────────────────────────
       LOAD FLOW GRAPH
    ───────────────────────────── */
    const nodes = await FlowNode.find({
      flow_id: session.flow_id,
      account_id: session.account_id
    }).lean();

    const nodesMap = new Map(nodes.map(n => [String(n._id), n]));

    let currentNode = nodesMap.get(String(session.current_node_id));
    if (!currentNode) {
      throw new Error("Nodo actual no encontrado");
    }

    /* ─────────────────────────────
       INPUT PROCESSING
    ───────────────────────────── */
    const requiresInput = INPUT_NODES.includes(currentNode.node_type);

    if (requiresInput) {
      if (input === undefined || input === null) {
        return res.status(400).json({
          message: "Este nodo requiere respuesta"
        });
      }

      if (currentNode.validation?.enabled) {
        const result = validateInput(
          input,
          currentNode.validation.rules || []
        );

        if (!result.ok) {
          return res.status(400).json({ message: result.message });
        }
      }

      if (session.mode === "production" && currentNode.variable_key) {
        session.variables[currentNode.variable_key] = String(input);
        session.markModified("variables");
      }

      await session.save();
    }

    /* ─────────────────────────────
       RESOLVE NEXT NODE
    ───────────────────────────── */
    const resolveNextNode = (node) => {

      // OPTIONS (buttons / quick replies)
      if (node.options?.length && input !== undefined) {
        const match = node.options
          .slice()
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .find(opt =>
            opt.value === input ||
            opt.label?.toLowerCase() === String(input).toLowerCase()
          );

        if (match?.next_node_id) {
          return nodesMap.get(String(match.next_node_id));
        }
      }

      // DIRECT CONNECTION
      if (node.next_node_id) {
        return nodesMap.get(String(node.next_node_id));
      }

      return null;
    };

    let nextNode = resolveNextNode(currentNode);

    /* ─────────────────────────────
       NO NEXT → END
    ───────────────────────────── */
    if (!nextNode) {
      session.is_completed = true;
      await session.save();

      if (session.mode === "production") {
        await upsertContactFromSession(session);
      }

      return res.json({ completed: true });
    }

    /* ─────────────────────────────
       AUTO EXECUTION LOOP
    ───────────────────────────── */
    while (nextNode) {

      session.current_node_id = nextNode._id;

      // 🔔 Notifications
      if (nextNode.meta?.notify?.enabled && session.mode === "production") {
        await executeNodeNotification(nextNode, session);
      }

      // 🛑 END NODE
      if (nextNode.end_conversation) {
        session.is_completed = true;
        await session.save();

        if (session.mode === "production") {
          await upsertContactFromSession(session);
        }

        return res.json(renderNode(nextNode, session._id));
      }

      // ✍️ INPUT NODE
      if (INPUT_NODES.includes(nextNode.node_type)) {
        await session.save();
        return res.json(renderNode(nextNode, session._id));
      }

      // 🔚 LINK / AUTO NODE WITHOUT OUTPUT
      if (
        !nextNode.next_node_id &&
        !nextNode.options?.length
      ) {
        session.is_completed = true;
        await session.save();

        if (session.mode === "production") {
          await upsertContactFromSession(session);
        }

        return res.json(renderNode(nextNode, session._id));
      }

      // ➡️ CONTINUE AUTO
      await session.save();
      currentNode = nextNode;
      nextNode = resolveNextNode(currentNode);
    }

  } catch (error) {
    console.error("nextStep:", error);
    return res.status(500).json({
      message: "Error al procesar conversación"
    });
  }
};
