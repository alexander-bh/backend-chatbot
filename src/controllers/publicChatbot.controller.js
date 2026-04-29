// controllers/publicChatbot.controller.js
const Chatbot = require("../models/Chatbot");
const Contact = require("../models/Contact");
const Flow = require("../models/Flow");
const FlowNode = require("../models/FlowNode");
const ConversationSession = require("../models/ConversationSession");
const { finalizeConversation } = require("../helper/finalizeConversation");

/**
 * GET /api/public-chatbot/chatbot-conversation/:public_id/bundle
 */
exports.getFlowBundle = async (req, res) => {
  try {
    const { public_id } = req.params;

    const chatbot = await Chatbot.findOne({ public_id, status: "active", is_enabled: true }).lean();
    if (!chatbot) return res.status(404).json({ message: "Chatbot no disponible" });

    const flow = await Flow.findOne({
      chatbot_id: chatbot._id,
      account_id: chatbot.account_id,
      status: "published"
    }).sort({ version: -1 }).lean();

    if (!flow || !flow.start_node_id) {
      return res.status(400).json({ message: "No hay flow publicado con nodo inicial" });
    }

    const nodes = await FlowNode.find({
      flow_id: flow._id,
      account_id: chatbot.account_id
    })
      .select("-__v -account_id")
      .lean();

    const safeNodes = nodes.map(n => ({
      _id: String(n._id),
      node_type: n.node_type,
      content: n.content,
      typing_time: n.typing_time || 0,
      end_conversation: n.end_conversation || false,
      next_node_id: n.next_node_id ? String(n.next_node_id) : null,
      branch_id: n.branch_id ? String(n.branch_id) : null,
      variable_key: n.variable_key || null,
      validation: n.validation || null,
      options: Array.isArray(n.options) ? n.options.map(o => ({
        label: o.label,
        value: o.value ?? o.label,
        next_node_id: o.next_node_id ? String(o.next_node_id) : null,
        next_branch_id: o.next_branch_id ? String(o.next_branch_id) : null
      })) : undefined,
      policy: Array.isArray(n.policy) ? n.policy.map(o => ({
        label: o.label,
        value: o.value ?? o.label,
        next_node_id: o.next_node_id ? String(o.next_node_id) : null,
        next_branch_id: o.next_branch_id ? String(o.next_branch_id) : null
      })) : undefined,
      link_actions: n.link_actions || undefined,
      media: Array.isArray(n.media) ? n.media.map(m => ({ type: m.type, url: m.url })) : undefined,
      auto_next: n.auto_next ?? false
    }));

    return res.json({
      chatbot_id: String(chatbot._id),
      chatbot_name: chatbot.name,
      start_node_id: String(flow.start_node_id),
      flow_id: String(flow._id),
      nodes: safeNodes
    });

  } catch (err) {
    console.error("getFlowBundle:", err);
    return res.status(500).json({ message: "Error al cargar el flow" });
  }
};

/**
 * POST /api/public-chatbot/chatbot-conversation/:public_id/finish
 * Responde inmediatamente al cliente y procesa email en background.
 */
exports.finishConversation = async (req, res) => {
  const t0 = Date.now();
  const { public_id } = req.params;

  try {
    const {
      history = [],
      variables = {},
      origin_url,
      visitor_id,
      mode = "production",
      device = "unknown"
    } = req.body;

    // ── Validación básica ──
    if (!Array.isArray(history)) {
      return res.status(400).json({ message: "history inválido" });
    }
    if (typeof variables !== "object" || Array.isArray(variables)) {
      return res.status(400).json({ message: "variables inválido" });
    }

    // ── Cargar chatbot ──
    const chatbot = await Chatbot.findOne({ public_id, status: "active" }).lean();
    if (!chatbot) return res.status(404).json({ message: "Chatbot no encontrado" });

    // ── Determinar si fue abandonado ──
    const isAbandoned = variables.data_processing_consent === "rejected";

    // ── Crear sesión ──
    const session = await ConversationSession.create({
      account_id: chatbot.account_id,
      chatbot_id: chatbot._id,
      flow_id: null,
      current_node_id: null,
      variables,
      history,
      origin_url: origin_url || null,
      visitor_id: visitor_id || null,
      device,
      mode,
      is_completed: !isAbandoned,
      is_abandoned: isAbandoned,
      abandoned_at: isAbandoned ? new Date() : undefined,
      last_activity_at: new Date(),
      status: isAbandoned ? "abandoned" : "completed"
    });

    console.log(`ℹ️ [finish] Sesión creada en ${Date.now() - t0}ms — session: ${session._id}`);

    // ── Abandonado: responder y salir ──
    if (isAbandoned) {
      return res.json({ completed: true, abandoned: true });
    }

    // ── Responder al cliente INMEDIATAMENTE ──
    res.json({ completed: true, contact_id: null });

    // ── Procesar en background (sin bloquear la respuesta) ──
    const tFinalize = Date.now();
    finalizeConversation(session)
      .then((contact) => {
        console.log(`✅ [finish] finalizeConversation OK en ${Date.now() - tFinalize}ms — contact: ${contact?._id}`);
      })
      .catch((err) => {
        console.error(`❌ [finish] Error en finalizeConversation (background) — session: ${session._id}`, {
          message: err.message,
          code: err.code,
          stack: err.stack,
        });
      });

  } catch (err) {
    console.error(`❌ [finish] Error general — ${Date.now() - t0}ms`, err);
    if (!res.headersSent) {
      return res.status(500).json({ message: "Error al finalizar conversación" });
    }
  }
};

exports.validateField = async (req, res) => {
  try {
    const { public_id } = req.params;
    const { field, value } = req.body;

    if (!field || !value) {
      return res.status(400).json({ valid: false, message: "Datos incompletos" });
    }

    const chatbot = await Chatbot.findOne({ public_id, status: "active" }).lean();
    if (!chatbot) return res.status(404).json({ valid: false, message: "Chatbot no encontrado" });

    if (field === "email") {
      const emailNorm = value.toLowerCase().trim();
      const exists = await Contact.exists({
        account_id: chatbot.account_id,
        email: emailNorm,
        is_deleted: { $ne: true },
        is_template: { $ne: true }
      });
      if (exists) {
        return res.json({ valid: false, message: "Este correo ya está registrado. Por favor ingresa otro." });
      }
    }

    if (field === "phone") {
      const phoneNorm = String(value).replace(/\D/g, "").trim();
      const exists = await Contact.exists({
        account_id: chatbot.account_id,
        phone: phoneNorm,
        is_deleted: { $ne: true },
        is_template: { $ne: true }
      });
      if (exists) {
        return res.json({ valid: false, message: "Este teléfono ya está registrado. Por favor ingresa otro." });
      }
    }

    return res.json({ valid: true });

  } catch (err) {
    console.error("validateField:", err);
    return res.status(500).json({ valid: false, message: "Error al validar" });
  }
};