// utils/validateFlow.js
exports.validateFlow = function (nodes, branches = [], start_node_id) {

  if (!Array.isArray(nodes) || nodes.length === 0) {
    throw new Error("Flow vacío");
  }

  const nodeMap = new Map();
  const ids = new Set();

  // 🔥 1️⃣ Unificar todos los nodos (main + ramas)
  const allNodes = [
    ...nodes,
    ...branches.flatMap(b => b.nodes || [])
  ];

  allNodes.forEach(node => {

    if (!node._id) {
      throw new Error("Nodo sin _id");
    }

    const id = String(node._id);

    if (ids.has(id)) {
      throw new Error(`_id duplicado: ${id}`);
    }

    ids.add(id);
    nodeMap.set(id, node);

    if (typeof node.order !== "number") {
      throw new Error(`Nodo sin order válido: ${id}`);
    }
  });

  /* ✅ Validar start_node */
  if (!nodeMap.has(String(start_node_id))) {
    throw new Error("start_node_id inválido");
  }

  /* VALIDAR SALIDAS */
  allNodes.forEach(node => {

    const hasOptionNext =
      Array.isArray(node.options) &&
      node.options.some(o => o.next_node_id);

    const hasNext = !!node.next_node_id || hasOptionNext;

    const isTerminal = node.end_conversation === true;
    const isLink = node.node_type === "link";

    if (!hasNext && !isTerminal && !isLink) {
      throw new Error(`Nodo sin salida: ${node._id}`);
    }

    // 🔥 VALIDAR next_node_id
    if (node.next_node_id &&
        !nodeMap.has(String(node.next_node_id))) {
      throw new Error(`next_node_id inválido en ${node._id}`);
    }

    // 🔥 VALIDAR options.next_node_id
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