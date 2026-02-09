exports.validateFlow = function (nodes) {

  const nodeMap = new Map();
  nodes.forEach(n => nodeMap.set(String(n._id), n));

  // 1️⃣ TODOS los nodos deben existir
  nodes.forEach(node => {
    if (!node._id) {
      throw new Error("Nodo sin _id");
    }
  });

  // 2️⃣ VALIDAR SALIDAS
  nodes.forEach(node => {

    const hasNext =
      !!node.next_node_id ||
      (Array.isArray(node.options) && node.options.some(o => o.next_node_id));

    const isTerminal = node.end_conversation === true;

    if (!hasNext && !isTerminal) {
      throw new Error(`Nodo sin salida: ${node._id}`);
    }
  });

  // 3️⃣ VALIDAR REFERENCIAS
  nodes.forEach(node => {

    if (node.next_node_id && !nodeMap.has(String(node.next_node_id))) {
      throw new Error(`next_node_id inválido en ${node._id}`);
    }

    if (node.parent_node_id &&
        !nodeMap.has(String(node.parent_node_id))) {
      throw new Error(`parent_node_id inválido en ${node._id}`);
    }

    if (Array.isArray(node.options)) {
      node.options.forEach(opt => {
        if (opt.next_node_id &&
            !nodeMap.has(String(opt.next_node_id))) {
          throw new Error(`option.next_node_id inválido en ${node._id}`);
        }
      });
    }
  });

  return true;
};
