// conversationsession.controller
const mongoose = require("mongoose");
const ConversationSession = require("../models/ConversationSession");
const Flow = require("../models/Flow");
const FlowNode = require("../models/FlowNode");
const Chatbot = require("../models/Chatbot");
const renderNode = require("../engine/renderNode");
const resolveInput = require("../engine/resolveInput");
const autoFlow = require("../engine/autoFlow");
const ALLOWED_MODES = ["preview", "production"];
const upsertContactFromSession = require("../services/upsertContactFromSession.service");

/* --------------------------------------------------
   START CONVERSATION
-------------------------------------------------- */
exports.startConversation = async (req, res) => {
  try {

    const { chatbot_id, flow_id, mode = "production", origin_url, visitor_id } = req.body;

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
      visitor_id: visitor_id || null,
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

    const session = await ConversationSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ message: "Sesión no encontrada" });
    }

    session.last_activity_at = new Date();

    const nodes = await FlowNode.find({
      flow_id: session.flow_id,
      account_id: session.account_id
    }).lean();

    const nodesMap = new Map(nodes.map(n => [String(n._id), n]));

    let node = nodesMap.get(String(session.current_node_id));

    if (!node) {
      session.is_completed = true;
      await session.save();
      return res.json({ completed: true, session_id: session._id });
    }

    const result = await resolveInput(node, input, session, nodesMap);

    if (result.validation_error) {
      return res.json(result);
    }

    node = result.node;

    if (!node) {
      session.is_completed = true;
      await session.save();

      const contact = await upsertContactFromSession(session);
      if (contact) {
        session.contact_id = contact._id;
        await session.save();
      }

      return res.json({
        completed: true,
        contact_id: contact?._id || null
      });
    }

    session.current_node_id = node._id;
    await session.save();

    const finalNode = await autoFlow(node, session, nodesMap);

    // ── FIX: siempre renderizar el nodo si existe ──
    if (finalNode) {
      await session.save();

      if (session.is_completed) {
        const contact = await upsertContactFromSession(session);
        if (contact) {
          session.contact_id = contact._id;
          await session.save();
        }
      }

      return res.json(renderNode(finalNode, session._id));
    }

    // ── Sin nodo final: devolver completed ──
    session.is_completed = true;
    await session.save();

    const contact = await upsertContactFromSession(session);
    if (contact) {
      session.contact_id = contact._id;
      await session.save();
    }

    return res.json({
      completed: true,
      contact_id: contact?._id || null
    });

  } catch (error) {
    console.error("nextStep:", error);
    return res.status(500).json({ message: "Error interno" });
  }
};