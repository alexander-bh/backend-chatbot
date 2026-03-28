function detectOrphanNodes(nodes, startNodeId) {

  const visited = new Set();

  const nodeMap = new Map(
    nodes.map(n => [String(n._id), n])
  );

  function walk(id) {

    if (!id || visited.has(String(id))) return;

    const node = nodeMap.get(String(id));

    if (!node) return;

    visited.add(String(id));

    walk(node.next_node_id);

  }

  walk(startNodeId);

  return nodes.filter(n => !visited.has(String(n._id)));
}

module.exports = detectOrphanNodes; 