// utils/validateFlow.js
exports.validateFlow = function (nodes, start_node_id) {

  if (!Array.isArray(nodes) || nodes.length === 0) {
    throw new Error("Flow vacío");
  }

  const nodeMap = new Map();
  const ids = new Set();

  nodes.forEach(node => {

    if (!node._id) {
      throw new Error("Nodo sin _id");
    }

    if (ids.has(String(node._id))) {
      throw new Error(`_id duplicado: ${node._id}`);
    }

    ids.add(String(node._id));
    nodeMap.set(String(node._id), node);

    if (typeof node.order !== "number") {
      throw new Error(`Nodo sin order válido: ${node._id}`);
    }
  });

  /* ✅ Validar start_node */
  if (!nodeMap.has(String(start_node_id))) {
    throw new Error("start_node_id inválido");
  }

  const sortedNodes = [...nodes].sort((a, b) => a.order - b.order);
  const indexMap = new Map(
    sortedNodes.map((n, i) => [String(n._id), i])
  );

  /* VALIDAR SALIDAS */
  nodes.forEach(node => {

    const hasOptionNext =
      Array.isArray(node.options) &&
      node.options.some(o => o.next_node_id);

    const hasNext = !!node.next_node_id || hasOptionNext;

    const isTerminal = node.end_conversation === true;
    const isLink = node.node_type === "link";

    const idx = indexMap.get(String(node._id));
    const hasOrderFallback =
      typeof idx === "number" && idx < sortedNodes.length - 1;

    if (!hasNext && !hasOrderFallback && !isTerminal && !isLink) {
      throw new Error(`Nodo sin salida: ${node._id}`);
    }
  });

  /* VALIDAR REFERENCIAS */
  nodes.forEach(node => {

    if (node.next_node_id &&
        !nodeMap.has(String(node.next_node_id))) {
      throw new Error(`next_node_id inválido en ${node._id}`);
    }

    if (Array.isArray(node.options)) {
      node.options.forEach(opt => {
        if (opt.next_node_id &&
            !nodeMap.has(String(opt.next_node_id))) {
          throw new Error(
            `option.next_node_id inválido en ${node._id}`
          );
        }
      });
    }
  });

  return true;
};
