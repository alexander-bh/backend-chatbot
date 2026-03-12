const resolveNextNode = require("./resolveNextNode");

module.exports = async function autoFlow(node, session, nodesMap) {

  const INPUT_NODES = ["question","email","phone","number"];
  const INTERACTION_NODES = ["options","policy"];

  let safety = 0;

  while (node && safety < 20) {

    safety++;

    session.current_node_id = node._id;

    if (node.end_conversation) {
      session.is_completed = true;
      return node;
    }

    if (
      INPUT_NODES.includes(node.node_type) ||
      INTERACTION_NODES.includes(node.node_type)
    ) {
      return node;
    }

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