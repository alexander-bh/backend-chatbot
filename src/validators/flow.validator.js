exports.validateFlow = function (nodes) {

  const nodeMap = new Map();
  nodes.forEach(n => nodeMap.set(String(n._id), n));

  const sortedNodes = [...nodes].sort((a, b) => a.order - b.order);
  const indexMap = new Map(
    sortedNodes.map((n, i) => [String(n._id), i])
  );

  /* 1️⃣ TODOS los nodos deben tener _id */
  nodes.forEach(node => {
    if (!node._id) {
      throw new Error("Nodo sin _id");
    }
  });

  /* 2️⃣ VALIDAR SALIDAS (MISMAS REGLAS QUE EL ENGINE) */
  nodes.forEach(node => {

    const hasOptionNext =
      Array.isArray(node.options) &&
      node.options.some(o => o.next_node_id);

    const hasNext = !!node.next_node_id || hasOptionNext;

    const isTerminal = node.end_conversation === true;
    const isLink = node.node_type === "link";

    // ORDER FALLBACK
    const idx = indexMap.get(String(node._id));
    const hasOrderFallback =
      typeof idx === "number" && idx < sortedNodes.length - 1;

    if (!hasNext && !hasOrderFallback && !isTerminal && !isLink) {
      throw new Error(`Nodo sin salida: ${node._id}`);
    }
  });

  /* 3️⃣ VALIDAR REFERENCIAS */
  nodes.forEach(node => {

    if (node.next_node_id && !nodeMap.has(String(node.next_node_id))) {
      throw new Error(`next_node_id inválido en ${node._id}`);
    }

    if (
      node.parent_node_id &&
      !nodeMap.has(String(node.parent_node_id))
    ) {
      throw new Error(`parent_node_id inválido en ${node._id}`);
    }

    if (Array.isArray(node.options)) {
      node.options.forEach(opt => {
        if (
          opt.next_node_id &&
          !nodeMap.has(String(opt.next_node_id))
        ) {
          throw new Error(`option.next_node_id inválido en ${node._id}`);
        }
      });
    }
  });

  return true;
};