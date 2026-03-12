module.exports = function resolveNextNode(node, session, nodesMap) {

  if (!node.next_node_id) return null;

  const candidate = nodesMap.get(String(node.next_node_id));

  if (!candidate) return null;

  if (candidate.branch_id && candidate.branch_id !== session.current_branch_id) {
    return null;
  }

  return candidate;
};