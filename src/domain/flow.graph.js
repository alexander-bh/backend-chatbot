const FlowNode = require("../models/FlowNode");

/**
 * Carga todo el grafo en memoria
 */
async function loadFlowGraph({
  flow_id,
  account_id,
  session
}) {

  const nodes = await FlowNode.find(
    { flow_id, account_id },
    null,
    { session }
  ).lean();

  const map = new Map(
    nodes.map(n => [String(n._id), n])
  );

  return map;
}

/**
 * Detecta ciclos DFS
 */
async function detectCycle({
  startNodeId,
  targetSearchId,
  flow_id,
  account_id,
  session
}) {

  const graph = await loadFlowGraph({
    flow_id,
    account_id,
    session
  });

  const visited = new Set();
  const stack = [String(startNodeId)];

  while (stack.length) {

    const currentId = stack.pop();

    if (!currentId) continue;

    if (currentId === String(targetSearchId)) {
      return true;
    }

    if (visited.has(currentId)) continue;

    visited.add(currentId);

    const node = graph.get(currentId);
    if (!node) continue;

    if (node.next_node_id) {
      stack.push(String(node.next_node_id));
    }

    node.options?.forEach(opt => {
      if (opt.next_node_id) {
        stack.push(String(opt.next_node_id));
      }
    });

  }

  return false;
}

module.exports = {
  loadFlowGraph,
  detectCycle
};
