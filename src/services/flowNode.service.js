const mongoose = require("mongoose");
const FlowNode = require("../models/FlowNode");
const updateStartNode = require("../utils/updateStartNode");
const { getEditableFlow } = require("../utils/flow.utils");
const { getNextOrder, reorderFlowNodes } = require("../helpers/node.order");
const { reconnectParents } = require("../helpers/node.reconnection");

const toObjectId = (id, field = "id") => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error(`${field} inválido`);
  }
  return new mongoose.Types.ObjectId(id);
};

const detectCycle = async ({
  startNodeId,
  targetSearchId,
  account_id,
  session
}) => {

  const visited = new Set();
  const stack = [startNodeId];

  while (stack.length) {

    const currentId = stack.pop();

    if (!currentId) continue;

    if (String(currentId) === String(targetSearchId)) {
      return true; // 🔥 ciclo detectado
    }

    if (visited.has(String(currentId))) continue;

    visited.add(String(currentId));

    const node = await FlowNode.findOne(
      { _id: currentId, account_id },
      null,
      { session }
    );

    if (!node) continue;

    if (node.next_node_id) {
      stack.push(node.next_node_id);
    }

    node.options?.forEach(opt => {
      if (opt.next_node_id) stack.push(opt.next_node_id);
    });

  }

  return false;
};

// ─────────────────────────────────────────────
// Crear nodo
// ─────────────────────────────────────────────
exports.createNode = async (data, account_id, session) => {

  const flowId = toObjectId(data.flow_id, "flow_id");
  const accountId = toObjectId(account_id, "account_id");

  await getEditableFlow(flowId, accountId);

  const order = await getNextOrder(flowId, accountId, session);

  const [node] = await FlowNode.create(
    [{
      ...data,
      flow_id: flowId,
      account_id: accountId,
      order,
      is_draft: true,
      next_node_id: null
    }],
    { session }
  );

  await updateStartNode(flowId, accountId, session);

  return node;
};

// ─────────────────────────────────────────────
// Obtener nodos por flow
// ─────────────────────────────────────────────
exports.getNodesByFlow = async (flow_id, account_id) => {

  const flowId = toObjectId(flow_id, "flow_id");
  const accountId = toObjectId(account_id, "account_id");

  await getEditableFlow(flowId, accountId);

  return FlowNode.find({
    flow_id: flowId,
    account_id: accountId
  }).sort({ order: 1 });
};

// ─────────────────────────────────────────────
// Actualizar nodo
// ─────────────────────────────────────────────
exports.updateNode = async ({ nodeId, data, account_id }) => {

  const nodeObjectId = toObjectId(nodeId, "nodeId");
  const accountObjectId = toObjectId(account_id, "account_id");

  const existing = await FlowNode.findOne({
    _id: nodeObjectId,
    account_id: accountObjectId
  });

  if (!existing) throw new Error("Nodo no encontrado");

  await getEditableFlow(existing.flow_id, accountObjectId);

  const updated = await FlowNode.findOneAndUpdate(
    {
      _id: nodeObjectId,
      account_id: accountObjectId
    },
    data,
    { new: true }
  );

  return updated;
};

// ─────────────────────────────────────────────
// Conectar nodos
// ─────────────────────────────────────────────
exports.connectNode = async ({
  sourceNodeId,
  targetNodeId,
  optionIndex,
  account_id,
  session
}) => {

  const sourceId = toObjectId(sourceNodeId);
  const accountId = toObjectId(account_id);

  const source = await FlowNode.findOne({
    _id: sourceId,
    account_id: accountId
  }).session(session);

  if (!source) throw new Error("Nodo origen no encontrado");

  await getEditableFlow(source.flow_id, accountId);

  let targetObjectId = null;

  if (targetNodeId) {

    targetObjectId = toObjectId(targetNodeId);

    const target = await FlowNode.findOne({
      _id: targetObjectId,
      account_id: accountId
    }).session(session);

    if (!target) throw new Error("Nodo destino no existe");

    if (!target.flow_id.equals(source.flow_id)) {
      throw new Error("No puedes conectar nodos de diferentes flows");
    }

    // 🔥 ANTI LOOP CHECK
    const wouldCreateLoop = await detectCycle({
      startNodeId: targetObjectId,
      targetSearchId: sourceId,
      account_id: accountId,
      session
    });

    if (wouldCreateLoop) {
      throw new Error("Esta conexión generaría un ciclo en el flujo");
    }
  }

  if (optionIndex === undefined) {
    source.next_node_id = targetObjectId;
  } else {
    if (!source.options?.[optionIndex]) {
      throw new Error("Opción inválida");
    }
    source.options[optionIndex].next_node_id = targetObjectId;
  }

  await source.save({ session });

  return source;
};

// ─────────────────────────────────────────────
// Eliminar nodo (cascada + reconexión)
// ─────────────────────────────────────────────
exports.deleteNode = async (nodeId, account_id, session) => {

  const nodeObjectId = toObjectId(nodeId, "nodeId");
  const accountObjectId = toObjectId(account_id, "account_id");

  const node = await FlowNode.findOne(
    {
      _id: nodeObjectId,
      account_id: accountObjectId
    },
    null,
    { session }
  );

  if (!node) throw new Error("Nodo no encontrado");

  return exports.deleteNodeCascade(node, accountObjectId, session);
};


// ─────────────────────────────────────────────
// Lógica interna de cascada
// ─────────────────────────────────────────────
exports.deleteNodeCascade = async (node, account_id, session) => {

  await getEditableFlow(node.flow_id, account_id);

  const reconnections = await reconnectParents(
    node,
    node.flow_id,
    account_id,
    session
  );

  const ids = new Set();
  const stack = [node._id];

  while (stack.length) {
    const id = stack.pop();

    if (ids.has(String(id))) continue;

    ids.add(String(id));

    const n = await FlowNode.findById(id, null, { session });

    if (!n) continue;

    if (n.next_node_id) stack.push(n.next_node_id);

    n.options?.forEach(o => {
      if (o.next_node_id) stack.push(o.next_node_id);
    });
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

  const flowId = toObjectId(flow_id, "flow_id");
  const accountId = toObjectId(account_id, "account_id");

  await getEditableFlow(flowId, accountId);

  await reorderFlowNodes(flowId, accountId, session, nodes);
};

// ─────────────────────────────────────────────
// Duplicar 
// ─────────────────────────────────────────────
exports.duplicateNode = async (nodeId, account_id, session) => {

  const nodeObjectId = toObjectId(nodeId, "nodeId");
  const accountObjectId = toObjectId(account_id, "account_id");

  const original = await FlowNode.findOne(
    { _id: nodeObjectId, account_id: accountObjectId },
    null,
    { session }
  );

  if (!original) throw new Error("Nodo no encontrado");

  await getEditableFlow(original.flow_id, accountObjectId);

  const order = await getNextOrder(original.flow_id, accountObjectId, session);

  const clonedOptions = (original.options || []).map(opt => ({
    label: opt.label,
    value: opt.value,
    order: opt.order ?? 0,
    next_node_id: null
  }));

  const [newNode] = await FlowNode.create(
    [{
      account_id: accountObjectId,
      flow_id: original.flow_id,
      parent_node_id: null,
      order,
      node_type: original.node_type,
      content: original.content,
      variable_key: null,
      options: clonedOptions,
      next_node_id: null,
      typing_time: original.typing_time,
      link_action: original.link_action,
      validation: original.validation,
      crm_field_key: original.crm_field_key,
      is_draft: true,
      end_conversation: original.end_conversation
    }],
    { session }
  );

  await updateStartNode(original.flow_id, accountObjectId, session);

  return newNode;
};
