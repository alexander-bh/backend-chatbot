const resolveNextNode = require("./resolveNextNode");

module.exports = async function autoFlow(node, session, nodesMap) {

  const INPUT_NODES = ["question", "email", "phone", "number"];
  const INTERACTION_NODES = ["options", "policy"];

  let safety = 0;

  while (node && safety < 20) {

    safety++;
    session.current_node_id = node._id;

    // ✅ Primero: nodos que requieren input del usuario
    if (
      INPUT_NODES.includes(node.node_type) ||
      INTERACTION_NODES.includes(node.node_type)
    ) {
      return node; // se detiene aquí, end_conversation se maneja después de que responda
    }

    // ✅ Segundo: nodos automáticos que terminan la conversación
    if (node.end_conversation) {
      session.is_completed = true;
      return node;
    }

    // ✅ Tercero: nodos automáticos que continúan
    if (
      node.node_type === "text" ||
      node.node_type === "media" ||
      node.node_type === "link"
    ) {
      return node;
    }

    node = resolveNextNode(node, session, nodesMap);
  }

  return node;
};