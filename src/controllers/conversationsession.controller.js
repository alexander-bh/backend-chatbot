//conversationsession.controller
const mongoose = require("mongoose");
const ConversationSession = require("../models/ConversationSession");
const Flow = require("../models/Flow");
const FlowNode = require("../models/FlowNode");
const Chatbot = require("../models/Chatbot");
const upsertContactFromSession = require("../services/upsertContactFromSession.service");
const renderNode = require("../utils/renderNode");
const validateNodeInput = require("../validators/validateNodeInput");
const ALLOWED_MODES = ["preview", "production"];

/* --------------------------------------------------
   START CONVERSATION
-------------------------------------------------- */
exports.startConversation = async (req, res) => {
  try {

    const { chatbot_id, flow_id, mode = "production", origin_url } = req.body;

    /* ================= VALIDATE INPUT ================= */

    if (!mongoose.Types.ObjectId.isValid(chatbot_id)) {
      return res.status(400).json({ message: "chatbot_id inválido" });
    }

    if (!ALLOWED_MODES.includes(mode)) {
      return res.status(400).json({ message: "Mode inválido" });
    }

    /* ================= LOAD CHATBOT ================= */

    let chatbot;

    if (req.user?.account_id) {

      chatbot = await Chatbot.findOne({
        _id: chatbot_id,
        account_id: req.user.account_id
      });

    } else {

      chatbot = await Chatbot.findById(chatbot_id);

    }

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no válido" });
    }

    if (!chatbot.is_enabled) {
      return res.status(403).json({
        message: "Chatbot deshabilitado"
      });
    }

    /* ================= ACCOUNT RESOLUTION ================= */

    const accountId = req.user?.account_id || chatbot.account_id;

    /* ================= LOAD FLOW ================= */

    let flow;

    if (mode === "production") {

      flow = await Flow.findOne({
        chatbot_id,
        account_id: accountId,
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
        account_id: accountId
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

    /* ================= LOAD START NODE ================= */

    const startNode = await FlowNode.findOne({
      _id: flow.start_node_id,
      flow_id: flow._id,
      account_id: accountId
    });

    if (!startNode) {
      return res.status(500).json({ message: "Nodo inicial inválido" });
    }

    /* ================= CREATE SESSION ================= */

    const session = await ConversationSession.create({
      account_id: accountId,
      chatbot_id,
      flow_id: flow._id,
      current_node_id: startNode._id,
      variables: {},
      origin_url,
      mode,
      is_completed: false,
      is_abandoned: false,
      last_activity_at: new Date(),
      history: []
    });

    /* ================= RESPONSE ================= */

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

    /* ================= LOAD FLOW ================= */

    const nodes = await FlowNode.find({
      flow_id: session.flow_id,
      account_id: session.account_id
    }).lean();

    const nodesMap = new Map(nodes.map(n => [String(n._id), n]));

    let node = nodesMap.get(String(session.current_node_id));

    if (!node) {
      throw new Error("Nodo actual no encontrado");
    }

    /* ================= NODE TYPES ================= */

    const INPUT_NODES = ["question", "email", "phone", "number"];
    const INTERACTION_NODES = ["options", "policy"];

    const isInputNode = n => INPUT_NODES.includes(n.node_type);
    const isInteractionNode = n => INTERACTION_NODES.includes(n.node_type);

    /* ================= HANDLE INPUT ================= */

    if (isInputNode(node) && input !== undefined) {

      const errors = validateNodeInput(node, input);

      if (errors.length) {

        await session.save();

        return res.json({
          session_id: session._id,
          node_id: node._id,
          node_type: node.node_type,
          type: node.node_type,
          validation_error: true,
          message: errors[0],
          input_type: node.node_type,
          completed: false
        });
      }

      session.history.push({
        node_id: node._id,
        question: node.content,
        answer: String(input),
        node_type: node.node_type,
        variable_key: node.variable_key
      });

      if (node.variable_key) {
        session.variables[node.variable_key] = String(input);
        session.markModified("variables");
      }

      session.markModified("history");
    }

    /* ================= RESOLVE NEXT ================= */

    const getNextNode = (current) => {

      if (!current.next_node_id) return null;

      const candidate = nodesMap.get(String(current.next_node_id));

      if (!candidate) return null;

      if (candidate.branch_id) {
        if (candidate.branch_id === session.current_branch_id) {
          return candidate;
        }
        return null;
      }

      return candidate;
    };

    /* ================= OPTIONS / POLICY ================= */

    if (isInteractionNode(node) && input !== undefined) {

      const source = node.node_type === "options"
        ? node.options
        : node.policy;

      const match = source.find(opt =>
        String(opt.value) === String(input) ||
        String(opt.label) === String(input)
      );

      console.log("MATCH ENCONTRADO:", JSON.stringify(match));

      if (!match) {
        return res.json(renderNode(node, session._id));
      }

      session.current_branch_id = match.next_branch_id ?? null;

      if (match.next_node_id) {

        const nextId = String(match.next_node_id);

        console.log("NEXT NODE ID:", nextId);
        console.log("NODE FOUND:", nodesMap.has(nextId));

        node = nodesMap.get(nextId);

        console.log("NODO RESUELTO:", node?.node_type, node?.branch_id);

      } else {
        node = getNextNode(node);
      }

      if (node) {
        session.current_node_id = node._id;
      }

    } else {

      if (isInputNode(node) && input === undefined) {
        return res.json(renderNode(node, session._id));
      }

      node = getNextNode(node);
    }

    /* ================= AUTO FLOW ================= */

    let safety = 0;

    while (node && safety < 20) {

      safety++;

      session.current_node_id = node._id;

      if (node.end_conversation) {

        session.is_completed = true;
        session.current_branch_id = null;

        await session.save();

        if (session.mode === "production") {
          await upsertContactFromSession(session);
        }

        return res.json(renderNode(node, session._id));
      }

      if (isInputNode(node) || isInteractionNode(node)) {

        await session.save();

        return res.json(renderNode(node, session._id));
      }

      /* ===== NODOS VISUALES ===== */

      if (node.node_type === "text" || node.node_type === "link") {

        await session.save();

        return res.json(renderNode(node, session._id));
      }

      /* ===== MEDIA ===== */

      if (node.node_type === "media") {

        await session.save();

        return res.json({
          ...renderNode(node, session._id),
          auto_next: true
        });
      }

      node = getNextNode(node);
    }

    /* ================= FALLBACK ================= */

    session.is_completed = true;

    await session.save();

    return res.json({ completed: true });

  } catch (error) {

    console.error("nextStep:", error);

    return res.status(500).json({
      message: "Error al procesar conversación"
    });

  }
};