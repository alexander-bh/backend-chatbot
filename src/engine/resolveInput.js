const validateNodeInput = require("../validators/validateNodeInput");

module.exports = async function resolveInput(node, input, session, nodesMap) {

  const INPUT_NODES = ["question", "email", "phone", "number"];
  const INTERACTION_NODES = ["options", "policy"];

  const isInputNode = INPUT_NODES.includes(node.node_type);
  const isInteractionNode = INTERACTION_NODES.includes(node.node_type);

  /* ─────────────────────────────
     SIN INPUT
  ───────────────────────────── */

  if (!input) {

    if (isInputNode || isInteractionNode) {
      return node; // quedarse esperando input
    }

    const next = nodesMap.get(String(node.next_node_id));
    return next ?? node;
  }

  /* ─────────────────────────────
     INPUT NODES
  ───────────────────────────── */

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

    session.history.push({
      node_id: node._id,
      question: node.content,
      answer: input
    });

    if (node.variable_key) {
      session.variables[node.variable_key] = input;
      session.markModified("variables");
    }

    const next = nodesMap.get(String(node.next_node_id));

    return next ?? node;
  }

  /* ─────────────────────────────
     OPTIONS / POLICY
  ───────────────────────────── */

  if (isInteractionNode) {

    const source =
      node.node_type === "options"
        ? node.options
        : node.policy;

    if (!Array.isArray(source) || source.length === 0) {
      return {
        validation_error: true,
        node_id: node._id,
        node_type: node.node_type,
        message: "No hay opciones disponibles"
      };
    }

    const normalize = v =>
      String(v ?? "")
        .trim()
        .toLowerCase();

    const inputNorm = normalize(input);

    const match = source.find(o =>
      normalize(o.value) === inputNorm ||
      normalize(o.label) === inputNorm
    );

    if (!match) {
      return {
        validation_error: true,
        node_id: node._id,
        node_type: node.node_type,
        message: "Opción inválida"
      };
    }

    session.history.push({
      node_id: node._id,
      question: node.content,
      answer: match.label
    });

    session.current_branch_id = match.next_branch_id ?? null;

    const next = nodesMap.get(String(match.next_node_id));

    return next ?? node;
  }

  /* ─────────────────────────────
     TEXT / MEDIA / LINK
  ───────────────────────────── */

  const next = nodesMap.get(String(node.next_node_id));

  return next ?? node;
};