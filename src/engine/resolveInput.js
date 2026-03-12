const validateNodeInput = require("../validators/validateNodeInput");

module.exports = async function resolveInput(node, input, session, nodesMap) {

  const INPUT_NODES = ["question", "email", "phone", "number"];
  const INTERACTION_NODES = ["options", "policy"];

  const isInputNode = INPUT_NODES.includes(node.node_type);
  const isInteractionNode = INTERACTION_NODES.includes(node.node_type);

  // ✅ Sin input: solo avanzar si el nodo no requiere interacción
  if (!input) {
    if (isInputNode || isInteractionNode) {
      return { node }; // estos sí necesitan input, quedarse
    }
    // text / media / link: avanzar al siguiente
    const next = nodesMap.get(String(node.next_node_id));
    return { node: next ?? node };
  }

  /* INPUT NODES */
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
    session.history.push({ node_id: node._id, question: node.content, answer: input });

    if (node.variable_key) {
      session.variables[node.variable_key] = input;
      session.markModified("variables");
    }
    const next = nodesMap.get(String(node.next_node_id));
    return { node: next };
  }

  /* OPTIONS / POLICY */
  if (isInteractionNode) {
    const source = node.node_type === "options" ? node.options : node.policy;
    const match = source.find(
      o => String(o.value) === String(input) || String(o.label) === String(input)
    );

    console.log("INPUT RECIBIDO:", input);
    console.log("OPTIONS DISPONIBLES:", source.map(o => o.value));
    console.log("MATCH:", match);

    if (!match) return { node };

    console.log("NEXT NODE ID:", match.next_node_id);
    console.log("EN MAPA:", nodesMap.has(String(match.next_node_id)));

    session.current_branch_id = match.next_branch_id ?? null;
    const next = nodesMap.get(String(match.next_node_id));

    console.log("NEXT NODE:", next);

    return { node: next };
  }

  /* text / media / link con input ignorado */
  const next = nodesMap.get(String(node.next_node_id));
  return { node: next ?? node };
};