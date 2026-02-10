const FlowNode = require("../models/FlowNode");

const hasOtherParents = async ({
  nodeId,
  flow_id,
  account_id,
  excludeParentId,
  session
}) => {
  const parent = await FlowNode.findOne(
    {
      flow_id,
      account_id,
      _id: { $ne: excludeParentId },
      $or: [
        { next_node_id: nodeId },
        { "options.next_node_id": nodeId }
      ]
    },
    null,
    { session }
  );

  return !!parent;
};

const collectSafeCascadeIds = async ({
  startNode,
  account_id,
  session
}) => {

  const idsToDelete = new Set();
  const stack = [startNode._id];
  
  // ✅ Marcar el nodo inicial como "a eliminar"
  idsToDelete.add(String(startNode._id));

  while (stack.length) {

    const currentId = stack.pop();
    const node = await FlowNode.findById(currentId, null, { session });
    
    if (!node) continue;

    // 🔍 Evaluar hijos del nodo actual
    const checkChild = async (childId) => {
      if (!childId) return;
      if (idsToDelete.has(String(childId))) return;

      // ❓ ¿Este hijo tiene OTROS padres además del que estamos eliminando?
      const hasOtherParents = await FlowNode.findOne(
        {
          flow_id: node.flow_id,
          account_id,
          _id: { $nin: [...idsToDelete].map(id => id) }, // Excluir nodos ya marcados
          $or: [
            { next_node_id: childId },
            { "options.next_node_id": childId }
          ]
        },
        null,
        { session }
      );

      // 🔥 Si NO tiene otros padres → se elimina en cascada
      if (!hasOtherParents) {
        idsToDelete.add(String(childId));
        stack.push(childId); // Seguir explorando sus hijos
      }
    };

    // Evaluar next_node_id
    await checkChild(node.next_node_id);

    // Evaluar opciones
    for (const opt of node.options || []) {
      await checkChild(opt.next_node_id);
    }
  }

  return [...idsToDelete];
};

module.exports = {
  hasOtherParents,
  collectSafeCascadeIds
};
