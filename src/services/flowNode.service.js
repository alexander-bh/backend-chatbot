const mongoose = require("mongoose");
const FlowNode = require("../models/FlowNode");
const updateStartNode = require("../utils/updateStartNode");
const { getEditableFlow } = require("../utils/flow.utils");
const { getNextOrder, reorderFlowNodes } = require("../helpers/node.order");
const { validateFlowGraph } = require("../helpers/flow.validator");
const NODE_FACTORY = require("../shared/factories/node.factory");
const NODE_UPDATE_FACTORY = require("../shared/factories/nodeUpdate.factory");
const { detectCycle } = require("../domain/flow.graph");

const toObjectId = (id, field = "id") => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error(`${field} inválido`);
  }
  return new mongoose.Types.ObjectId(id);
};

/* ─────────────────────────────────────────────
   Crear nodo
───────────────────────────────────────────── */
exports.createNode = async ({ data, account_id, session }) => {

  const flowId = toObjectId(data.flow_id);
  const accountId = toObjectId(account_id);

  await getEditableFlow(flowId, accountId);

  const builder = NODE_FACTORY[data.node_type];
  if (!builder) throw new Error("Tipo de nodo no soportado");

  const order = await getNextOrder(flowId, accountId, session);

  const [node] = await FlowNode.create([{
    flow_id: flowId,
    account_id: accountId,
    node_type: data.node_type,
    order,
    is_draft: true,
    next_node_id: null,
    options: [],
    ...builder(data.data || {})
  }], { session });

  await updateStartNode(flowId, accountId, session);

  await validateFlowGraph({
    flow_id: flowId,
    account_id: accountId
  });

  return node;
};

/* ─────────────────────────────────────────────
   Obtener nodos por flow
───────────────────────────────────────────── */
exports.getNodesByFlow = async (flow_id, account_id) => {

  const flowId = toObjectId(flow_id, "flow_id");
  const accountId = toObjectId(account_id, "account_id");

  await getEditableFlow(flowId, accountId);

  return FlowNode.find({
    flow_id: flowId,
    account_id: accountId
  }).sort({ order: 1 });
};

/* ─────────────────────────────────────────────
   Actualizar nodo
───────────────────────────────────────────── */
exports.updateNode = async ({ nodeId, data, account_id, session }) => {

  const nodeObjectId = toObjectId(nodeId, "nodeId");
  const accountObjectId = toObjectId(account_id, "account_id");

  const node = await FlowNode.findOne({
    _id: nodeObjectId,
    account_id: accountObjectId
  }).session(session);

  if (!node) throw new Error("Nodo no encontrado");

  await getEditableFlow(node.flow_id, accountObjectId);

  const updater = NODE_UPDATE_FACTORY[node.node_type];
  if (!updater) {
    throw new Error("Este tipo de nodo no soporta edición");
  }

  const patch = updater(data) || {};

  const simulated = {
    ...node.toObject(),
    ...patch,
    is_draft: true
  };

  const isModifyingConnections =
    patch.hasOwnProperty('next_node_id') ||
    patch.hasOwnProperty('options') ||
    patch.hasOwnProperty('end_conversation');

  if (isModifyingConnections && !simulated.end_conversation) {

    const hasOutput =
      simulated.next_node_id ||
      simulated.options?.some(o => o.next_node_id);

    if (!hasOutput && simulated.node_type !== "link") {
      throw new Error("Nodo sin salida");
    }
  }

  const { _id, ...safePatch } = simulated;

  const updated = await FlowNode.findOneAndUpdate(
    {
      _id: nodeObjectId,
      account_id: accountObjectId
    },
    { $set: safePatch },
    { new: true, session }
  );

  return updated;
};

/* ─────────────────────────────────────────────
   Conectar nodos
───────────────────────────────────────────── */
exports.connectNode = async ({
  sourceNodeId,
  targetNodeId,
  optionIndex,
  account_id,
  session
}) => {

  const sourceId = toObjectId(sourceNodeId, "sourceNodeId");
  const accountId = toObjectId(account_id, "account_id");

  const source = await FlowNode.findOne({
    _id: sourceId,
    account_id: accountId
  }).session(session);

  if (!source) throw new Error("Nodo origen no encontrado");

  await getEditableFlow(source.flow_id, accountId);

  let targetObjectId = null;

  if (targetNodeId) {

    targetObjectId = toObjectId(targetNodeId, "targetNodeId");

    const target = await FlowNode.findOne({
      _id: targetObjectId,
      account_id: accountId
    }).session(session);

    if (!target) throw new Error("Nodo destino no existe");

    if (!target.flow_id.equals(source.flow_id)) {
      throw new Error("No puedes conectar nodos de diferentes flows");
    }

    const wouldCreateLoop = await detectCycle({
      startNodeId: targetObjectId,
      targetSearchId: sourceId,
      flow_id: source.flow_id,
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
    if (
      !Array.isArray(source.options) ||
      optionIndex < 0 ||
      optionIndex >= source.options.length
    ) {
      throw new Error("Opción inválida");
    }

    source.options[optionIndex].next_node_id = targetObjectId;
  }

  source.is_draft = true;

  await source.save({ session });

  await validateFlowGraph({
    flow_id: source.flow_id,
    account_id: accountId
  });

  return source;
};

/* ─────────────────────────────────────────────
   Eliminar nodo
───────────────────────────────────────────── */
exports.deleteNode = async ({ nodeId, account_id, session }) => {

  const nodeObjectId = toObjectId(nodeId);
  const accountObjectId = toObjectId(account_id);

  const node = await FlowNode.findOne({
    _id: nodeObjectId,
    account_id: accountObjectId
  }).session(session);

  if (!node) throw new Error("Nodo no encontrado");

  await getEditableFlow(node.flow_id, accountObjectId);

  const parents = await FlowNode.find({
    flow_id: node.flow_id,
    account_id: accountObjectId,
    $or: [
      { next_node_id: nodeObjectId },
      { "options.next_node_id": nodeObjectId }
    ]
  }).session(session);

  for (const p of parents) {

    if (String(p.next_node_id) === String(nodeObjectId)) {
      p.next_node_id = null;
    }

    p.options = p.options.map(opt => ({
      ...opt,
      next_node_id:
        String(opt.next_node_id) === String(nodeObjectId)
          ? null
          : opt.next_node_id
    }));

    p.is_draft = true;
    await p.save({ session });
  }

  await updateStartNode(node.flow_id, accountObjectId, session, [nodeObjectId]);

  await FlowNode.deleteOne(
    { _id: nodeObjectId, account_id: accountObjectId },
    { session }
  );

  await reorderFlowNodes(node.flow_id, accountObjectId, session);

  await validateFlowGraph({
    flow_id: node.flow_id,
    account_id: accountObjectId,
    session
  });

  return { deleted: 1 };
};

/* ─────────────────────────────────────────────
   Reordenar nodos
───────────────────────────────────────────── */
exports.reorderNodes = async ({ flow_id, nodes, account_id, session }) => {

  const flowId = toObjectId(flow_id, "flow_id");
  const accountId = toObjectId(account_id, "account_id");

  if (!Array.isArray(nodes)) {
    throw new Error("Formato de nodos inválido");
  }

  await getEditableFlow(flowId, accountId);

  await reorderFlowNodes(flowId, accountId, session, nodes);

  await validateFlowGraph({
    flow_id: flowId,
    account_id: accountId
  });
};

/* ─────────────────────────────────────────────
   Duplicar nodo
───────────────────────────────────────────── */
exports.duplicateNode = async ({ nodeId, account_id, session }) => {

  const nodeObjectId = toObjectId(nodeId);
  const accountObjectId = toObjectId(account_id);

  const original = await FlowNode.findOne(
    { _id: nodeObjectId, account_id: accountObjectId },
    null,
    { session }
  );

  if (!original) throw new Error("Nodo no encontrado");

  await getEditableFlow(original.flow_id, accountObjectId);

  const order = await getNextOrder(
    original.flow_id,
    accountObjectId,
    session
  );

  const clone = original.toObject();

  delete clone._id;
  delete clone.next_node_id;

  clone.options = (clone.options || []).map(opt => ({
    label: opt.label,
    value: opt.value,
    order: opt.order ?? 0,
    next_node_id: null
  }));

  clone.variable_key = null;
  clone.order = order;
  clone.account_id = accountObjectId;
  clone.flow_id = original.flow_id;
  clone.is_draft = true;

  const [newNode] = await FlowNode.create([clone], { session });

  await updateStartNode(original.flow_id, accountObjectId, session);

  await validateFlowGraph({
    flow_id: original.flow_id,
    account_id: accountObjectId
  });

  return newNode;
};
