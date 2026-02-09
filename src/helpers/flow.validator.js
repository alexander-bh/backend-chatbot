const FlowNode = require("../models/FlowNode");

exports.validateFlowGraph = async ({
  flow_id,
  account_id
}) => {

  const nodes = await FlowNode.find({
    flow_id,
    account_id
  });

  if (!nodes.length) return;

  const map = new Map();
  nodes.forEach(n => map.set(String(n._id), n));

  let startNodes = 0;

  for (const node of nodes) {
    if (!node.parent_node_id) startNodes++;

    const check = (id) => {
      if (!id) return;
      if (!map.has(String(id))) {
        throw new Error(`Nodo apunta a destino inexistente`);
      }
    };

    check(node.next_node_id);

    node.options?.forEach(o => check(o.next_node_id));
  }

  if (startNodes > 1) {
    throw new Error("El flujo tiene múltiples nodos de inicio");
  }
};
