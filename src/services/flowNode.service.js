const FlowNode = require("../models/FlowNode");
const updateStartNode = require("../utils/updateStartNode");
const { getEditableFlow } = require("../utils/flow.utils");
const { getNextOrder, reorderFlowNodes } = require("../helpers/node.order");
const { reconnectParents } = require("../helpers/node.reconnection");

// ─────────────────────────────────────────────
// Crear nodo
// ─────────────────────────────────────────────
exports.createNode = async (data, account_id, session) => {
  await getEditableFlow(data.flow_id, account_id);

  const order = await getNextOrder(data.flow_id, account_id, session);

  const [node] = await FlowNode.create(
    [{
      ...data,
      account_id,
      order,
      is_draft: true,
      next_node_id: null
    }],
    { session }
  );

  await updateStartNode(data.flow_id, account_id, session);
  return node;
};

// ─────────────────────────────────────────────
// Obtener nodos por flow
// ─────────────────────────────────────────────
exports.getNodesByFlow = async (flow_id, account_id) => {
  await getEditableFlow(flow_id, account_id);

  return FlowNode.find({
    flow_id,
    account_id
  }).sort({ order: 1 });
};

// ─────────────────────────────────────────────
// Actualizar nodo
// ─────────────────────────────────────────────
exports.updateNode = async ({ nodeId, data, account_id }) => {
  const node = await FlowNode.findOneAndUpdate(
    { _id: nodeId, account_id },
    data,
    { new: true }
  );

  if (!node) throw new Error("Nodo no encontrado");
  return node;
};

// ─────────────────────────────────────────────
// Conectar nodos
// ─────────────────────────────────────────────
exports.connectNode = async ({
  sourceNodeId,
  targetNodeId,
  optionIndex,
  account_id
}) => {
  const source = await FlowNode.findOne({
    _id: sourceNodeId,
    account_id
  });

  if (!source) throw new Error("Nodo origen no encontrado");

  // conexión directa
  if (optionIndex === undefined) {
    source.next_node_id = targetNodeId;
  } 
  // conexión por opción
  else {
    if (!source.options?.[optionIndex]) {
      throw new Error("Opción inválida");
    }
    source.options[optionIndex].next_node_id = targetNodeId;
  }

  await source.save();
  return source;
};

// ─────────────────────────────────────────────
// Eliminar nodo (cascada + reconexión)
// ─────────────────────────────────────────────
exports.deleteNode = async (nodeId, account_id, session) => {
  const node = await FlowNode.findOne(
    { _id: nodeId, account_id },
    null,
    { session }
  );

  if (!node) throw new Error("Nodo no encontrado");

  return exports.deleteNodeCascade(node, account_id, session);
};

// ─────────────────────────────────────────────
// Lógica interna de cascada
// ─────────────────────────────────────────────
exports.deleteNodeCascade = async (node, account_id, session) => {
  await getEditableFlow(node.flow_id, account_id);

  // Reconectar padres → B eliminado, A → C
  const reconnections = await reconnectParents(
    node,
    node.flow_id,
    account_id,
    session
  );

  // Cascada descendente
  const ids = new Set();
  const stack = [node._id];

  while (stack.length) {
    const id = stack.pop();
    if (ids.has(String(id))) continue;

    ids.add(String(id));
    const n = await FlowNode.findById(id, null, { session });
    if (!n) continue;

    if (n.next_node_id) stack.push(n.next_node_id);
    n.options?.forEach(o => o.next_node_id && stack.push(o.next_node_id));
  }

  await FlowNode.deleteMany(
    { _id: { $in: [...ids] } },
    { session }
  );

  await reorderFlowNodes(node.flow_id, account_id, session);
  await updateStartNode(node.flow_id, account_id, session);

  return {
    deleted: ids.size,
    reconnections
  };
};

// ─────────────────────────────────────────────
// Reordenar nodos (drag & drop)
// ─────────────────────────────────────────────
exports.reorderNodes = async (flow_id, nodes, account_id, session) => {
  await getEditableFlow(flow_id, account_id);
  await reorderFlowNodes(flow_id, account_id, session, nodes);
};
