module.exports = function conversationEngine({
  nodes,
  startNodeId,
  currentNodeId,
  input,
  mode,
  variables = {}
}) {

  const nodesMap = new Map(nodes.map(n => [String(n._id), n]));
  const sortedNodes = [...nodes].sort((a, b) => a.order - b.order);
  const indexMap = new Map(sortedNodes.map((n, i) => [String(n._id), i]));

  let currentNode = nodesMap.get(String(currentNodeId || startNodeId));
  if (!currentNode) {
    throw new Error("Nodo actual inválido");
  }

  /* ───────── INPUT ───────── */
  const INPUT_NODES = ["question", "email", "phone", "number", "text_input"];

  if (INPUT_NODES.includes(currentNode.node_type) && input !== undefined) {
    if (currentNode.variable_key && mode === "production") {
      variables[currentNode.variable_key] = String(input);
    }
  }

  /* ───────── NEXT NODE ───────── */
  const resolveNextNode = () => {

    if (currentNode.options?.length && input !== undefined) {
      const match = [...currentNode.options]
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .find(opt =>
          opt.value === input ||
          opt.label?.toLowerCase() === String(input).toLowerCase()
        );

      if (match?.next_node_id) {
        return nodesMap.get(String(match.next_node_id));
      }
    }

    if (currentNode.next_node_id) {
      return nodesMap.get(String(currentNode.next_node_id));
    }

    const idx = indexMap.get(String(currentNode._id));
    return sortedNodes[idx + 1];
  };

  let nextNode = resolveNextNode();

  return {
    currentNode,
    nextNode,
    variables,
    completed: !nextNode || currentNode.end_conversation
  };
};
