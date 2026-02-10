const mongoose = require("mongoose");
const FlowNode = require("../models/FlowNode");
const updateStartNode = require("../utils/updateStartNode");
const { getEditableFlow } = require("../utils/flow.utils");
const { getNextOrder, reorderFlowNodes } = require("../helpers/node.order");
const { reconnectParents } = require("../helpers/node.reconnection");
const { collectSafeCascadeIds } = require("../helpers/node.graph");
const { validateFlowGraph } = require("../helpers/flow.validator")
const NODE_FACTORY = require("../shared/factories/node.factory");
const NODE_UPDATE_FACTORY = require(
  "../shared/factories/nodeUpdate.factory"
);

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
exports.createNode = async ({ data, account_id, session }) => {

  const flowId = toObjectId(data.flow_id, "flow_id");
  const accountId = toObjectId(account_id, "account_id");

  await getEditableFlow(flowId, accountId);

  const builder = NODE_FACTORY[data.node_type];
  if (!builder) {
    throw new Error("Tipo de nodo no soportado");
  }

  const order = await getNextOrder(flowId, accountId, session);

  const startNode = await FlowNode.findOne(
    { flow_id: flowId, account_id: accountId, parent_node_id: null },
    null,
    { session }
  );

  const nodePayload = {
    flow_id: flowId,
    account_id: accountId,
    node_type: data.node_type,
    order,
    parent_node_id: startNode ? startNode._id : null,
    is_draft: true,
    ...builder(data.data || {})
  };

  const [node] = await FlowNode.create([nodePayload], { session });

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

  const updated = await FlowNode.findOneAndUpdate(
    {
      _id: nodeObjectId,
      account_id: accountObjectId
    },
    patch,
    { new: true, session }
  );

  updated.is_draft = true;
  await updated.save({ session });

  await validateFlowGraph({
    flow_id: node.flow_id,
    account_id: accountObjectId
  });

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
      account_id: accountId,
      session
    });

    if (wouldCreateLoop) {
      throw new Error("Esta conexión generaría un ciclo en el flujo");
    }
  }

  if (optionIndex === undefined) {
    // conexión directa
    source.next_node_id = targetObjectId;
  } else {
    // conexión por opción
    if (
      !Array.isArray(source.options) ||
      optionIndex < 0 ||
      optionIndex >= source.options.length
    ) {
      throw new Error("Opción inválida");
    }

    source.options[optionIndex].next_node_id = targetObjectId;
  }

  await source.save({ session });

  await validateFlowGraph({
    flow_id: source.flow_id,
    account_id: accountId
  });

  return source;
};

// ─────────────────────────────────────────────
// Eliminar nodo (cascada + reconexión)
// ─────────────────────────────────────────────
exports.deleteNode = async ({ nodeId, account_id, session }) => {

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

  if (!node) {
    throw new Error("Nodo no encontrado");
  }

  await getEditableFlow(node.flow_id, accountObjectId);

  const result = await exports.deleteNodeCascade(
    node,
    accountObjectId,
    session
  );

  return result;
};

// ─────────────────────────────────────────────
// Lógica interna de cascada
// ─────────────────────────────────────────────
exports.deleteNodeCascade = async (node, account_id, session) => {

  /**
   * 1️⃣ Recolectar nodos eliminables en cascada
   */
  const ids = await collectSafeCascadeIds({
    startNode: node,
    account_id,
    session
  });

  /**
   * 2️⃣ Reconectar padres del nodo raíz
   *    (esto elimina referencias hacia nodos borrados)
   */
  const reconnections = await reconnectParents(
    node,
    node.flow_id,
    account_id,
    session,
    ids
  );

  /**
   * 3️⃣ Limpieza defensiva de referencias colgantes
   */
  await FlowNode.updateMany(
    {
      flow_id: node.flow_id,
      account_id,
      $or: [
        { next_node_id: { $in: ids } },
        { "options.next_node_id": { $in: ids } }
      ]
    },
    {
      $unset: {
        next_node_id: "",
        "options.$[].next_node_id": ""
      }
    },
    { session }
  );

  /**
   * 4️⃣ 🔥 CERRAR NODOS QUE SE QUEDARON SIN SALIDA
   *     (ESTE ERA EL BUG QUE TENÍAS)
   */
  const affectedParents = await FlowNode.find(
    {
      flow_id: node.flow_id,
      account_id,
      _id: { $nin: ids }
    },
    null,
    { session }
  );

  for (const parent of affectedParents) {

    const hasOutput =
      !!parent.next_node_id ||
      parent.options?.some(o => o.next_node_id);

    if (!hasOutput && !parent.end_conversation) {
      parent.end_conversation = true;
      parent.is_draft = true;
      await parent.save({ session });
    }
  }

  /**
   * 5️⃣ Normalizar nodo start
   */
  await updateStartNode(
    node.flow_id,
    account_id,
    session,
    ids
  );

  /**
   * 6️⃣ Eliminar nodos
   */
  await FlowNode.deleteMany(
    {
      _id: { $in: ids },
      account_id
    },
    { session }
  );

  /**
   * 7️⃣ Reordenar flujo
   */
  await reorderFlowNodes(
    node.flow_id,
    account_id,
    session
  );

  return {
    deleted: ids.length,
    reconnections
  };
};

// ─────────────────────────────────────────────
// Reordenar nodos (drag & drop)
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// Duplicar 
// ─────────────────────────────────────────────
exports.duplicateNode = async ({ nodeId, account_id, session }) => {

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

  // 🔑 buscar nodo start actual
  const startNode = await FlowNode.findOne(
    {
      flow_id: original.flow_id,
      account_id: accountObjectId,
      parent_node_id: null
    },
    null,
    { session }
  );

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
      parent_node_id: startNode ? startNode._id : null,
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
      meta: original.meta ? { ...original.meta } : undefined,
      is_draft: true,
      end_conversation: original.end_conversation
    }],
    { session }
  );

  await updateStartNode(original.flow_id, accountObjectId, session);

  await validateFlowGraph({
    flow_id: original.flow_id,
    account_id: accountObjectId
  });

  return newNode;
};


