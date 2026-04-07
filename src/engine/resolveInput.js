const validateNodeInput = require("../validators/validateNodeInput");
const Contact = require("../models/Contact");

module.exports = async function resolveInput(node, input, session, nodesMap) {

  const INPUT_NODES = ["question", "email", "phone", "number"];
  const INTERACTION_NODES = ["options", "policy"];

  const isInputNode = INPUT_NODES.includes(node.node_type);
  const isInteractionNode = INTERACTION_NODES.includes(node.node_type);

  if (input === undefined || input === null) {
    if (isInputNode || isInteractionNode) {
      return { node };
    }
    // text / media / link: avanzar al siguiente
    const next = nodesMap.get(String(node.next_node_id));
    return { node: next ?? node };
  }

  if (isInputNode) {
    const errors = validateNodeInput(node, input);
    if (errors.length) {
      return {
        validation_error: true,
        node_id: node._id,
        node_type: node.node_type,
        message: errors[0],
        input_type: node.node_type
      };
    }

    // ── VALIDACIÓN EMAIL DUPLICADO ──────────────────────────────────────────
    if (node.node_type === "email" && session.account_id) {
      const emailNormalized = input.toLowerCase().trim();
      const exists = await Contact.exists({
        account_id: session.account_id,
        email: emailNormalized,
        is_deleted: { $ne: true },
        is_template: { $ne: true }
      });

      if (exists) {
        return {
          validation_error: true,
          node_id: node._id,
          node_type: node.node_type,
          message: "Este correo ya está registrado. Por favor ingresa otro.",
          input_type: node.node_type
        };
      }
    }

    // ── VALIDACIÓN TELÉFONO DUPLICADO ───────────────────────────────────────
    if (node.node_type === "phone" && session.account_id) {
      const phoneNormalized = input.replace(/\D/g, "").trim();
      const exists = await Contact.exists({
        account_id: session.account_id,
        phone: phoneNormalized,
        is_deleted: { $ne: true },
        is_template: { $ne: true }
      });

      if (exists) {
        return {
          validation_error: true,
          node_id: node._id,
          node_type: node.node_type,
          message: "Este teléfono ya está registrado. Por favor ingresa otro.",
          input_type: node.node_type
        };
      }
    }
    // ───────────────────────────────────────────────────────────────────────

    session.history.push({ node_id: node._id, question: node.content, answer: input });
    session.markModified("history");

    if (node.variable_key) {
      session.variables[node.variable_key] = input;
      session.markModified("variables");
    }
    const next = nodesMap.get(String(node.next_node_id));
    return { node: next };
  }

  /* OPTIONS / POLICY */
  if (isInteractionNode) {

    const source = node.node_type === "options"
      ? node.options
      : node.policy;

    const match = source.find(
      o => String(o.value).toLowerCase() === String(input).toLowerCase() ||
        String(o.label).toLowerCase() === String(input).toLowerCase()
    );

    if (!match) return { node };

    // Guardar historial
    session.history.push({
      node_id: node._id,
      question: node.content,
      answer: match.label
    });
    session.markModified("history");

    /* POLICY LOGIC */
    if (node.node_type === "policy") {

      let consentValue = match.value;

      if (consentValue.toUpperCase() === "SI") consentValue = "accepted";
      if (consentValue.toUpperCase() === "NO") consentValue = "rejected";

      session.variables.data_processing_consent = consentValue;
      session.markModified("variables");

      if (consentValue === "rejected") {

        // ── Marcar como abandonado, NO completado ──
        session.is_abandoned = true;
        session.abandoned_at = new Date();
        session.is_completed = false;
        session.markModified("variables");
        session.status = "abandoned";
        session.markModified("is_abandoned");
        session.markModified("status");
        return {
          node: {
            node_type: "text",
            type: "text",
            content: "No podemos continuar sin aceptar nuestras políticas de tratamiento de datos.",
            typing_time: 1,
            end_conversation: true,
            auto_next: false
          }
        };

      }

    }

    session.current_branch_id = match.next_branch_id ?? null;

    const next = nodesMap.get(String(match.next_node_id));

    return { node: next };
  }

  /* text / media / link con input ignorado */
  const next = nodesMap.get(String(node.next_node_id));
  return { node: next ?? node };
};