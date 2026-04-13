// controllers/publicChatbot.controller.js
const Chatbot = require("../models/Chatbot");
const Contact = require("../models/Contact");
const Flow = require("../models/Flow");
const FlowNode = require("../models/FlowNode");
const ConversationSession = require("../models/ConversationSession");
const { finalizeConversation } = require("../helper/finalizeConversation");

/**
 * GET /api/public-chatbot/chatbot-conversation/:public_id/bundle
 * Devuelve todos los nodos del flow publicado para ejecución local en el cliente.
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
      .select("-__v -account_id") // no exponer datos internos
      .lean();

    // Solo los campos que necesita el cliente
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
      // opciones/policy solo con label+value+next, sin IDs internos expuestos
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
 * Recibe el historial y variables recopilados en el cliente,
 * crea la sesión y finaliza (upsert contacto, notificaciones, email).
 * 
 * Body: { history, variables, origin_url, visitor_id, mode? }
 */
exports.finishConversation = async (req, res) => {
  try {
    const { public_id } = req.params;
    const { history = [], variables = {}, origin_url, visitor_id, mode = "production" } = req.body;

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

    // ── Validar email duplicado si viene en variables ──
    if (variables.email) {
      const emailNorm = variables.email.toLowerCase().trim();
      const exists = await Contact.exists({
        account_id: chatbot.account_id,
        email: emailNorm,
        is_deleted: { $ne: true },
        is_template: { $ne: true }
      });
      if (exists) {
        return res.status(409).json({
          message: "Este correo ya está registrado.",
          field: "email"
        });
      }
    }

    // ── Validar teléfono duplicado si viene en variables ──
    if (variables.phone) {
      const phoneNorm = String(variables.phone).replace(/\D/g, "").trim();
      const exists = await Contact.exists({
        account_id: chatbot.account_id,
        phone: phoneNorm,
        is_deleted: { $ne: true },
        is_template: { $ne: true }
      });
      if (exists) {
        return res.status(409).json({
          message: "Este teléfono ya está registrado.",
          field: "phone"
        });
      }
    }

    // ── Determinar si fue abandonado (rechazó política) ──
    const consent = variables.data_processing_consent;
    const isAbandoned = consent === "rejected";

    // ── Crear sesión directamente completada ──
    const session = await ConversationSession.create({
      account_id: chatbot.account_id,
      chatbot_id: chatbot._id,
      flow_id: null,           // no tenemos flow_id aquí; opcional: recibirlo en body
      current_node_id: null,
      variables,
      history,
      origin_url: origin_url || null,
      visitor_id: visitor_id || null,
      mode,
      is_completed: !isAbandoned,
      is_abandoned: isAbandoned,
      abandoned_at: isAbandoned ? new Date() : undefined,
      last_activity_at: new Date(),
      status: isAbandoned ? "abandoned" : "completed"
    });

    // ── Si fue abandonado, no crear contacto ──
    if (isAbandoned) {
      return res.json({ completed: true, abandoned: true });
    }

    // ── Finalizar: upsert contacto + notificaciones + email ──
    const contact = await finalizeConversation(session);

    return res.json({
      completed: true,
      contact_id: contact?._id || null
    });

  } catch (err) {
    console.error("finishConversation:", err);
    return res.status(500).json({ message: "Error al finalizar conversación" });
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