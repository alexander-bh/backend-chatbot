const mongoose = require("mongoose");
const flowNodeService = require("../services/flowNode.service");


// Crear nodos
exports.createNode = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const node = await flowNodeService.createNode(
      req.body,
      req.user.account_id,
      session
    );

    await session.commitTransaction();
    res.status(201).json(node);
  } catch (err) {
    await session.abortTransaction();
    res.status(400).json({ message: err.message });
  } finally {
    session.endSession();
  }
};

// Conectar nodos 
exports.connectNode = async (req, res) => {
  try {
    const node = await flowNodeService.connectNode({
      ...req.body,
      account_id: req.user.account_id
    });

    res.json(node);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// Obtener nodos por flow
exports.getNodesByFlow = async (req, res) => {
  try {
    const nodes = await flowNodeService.getNodesByFlow(
      req.params.flowId,
      req.user.account_id
    );
    res.json(nodes);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// Actualizar nodos
exports.updateNode = async (req, res) => {
  try {
    const node = await flowNodeService.updateNode({
      nodeId: req.params.nodeId,
      data: req.body,
      account_id: req.user.account_id
    });

    res.json(node);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// Duplicar nodos
exports.duplicateNode = async (nodeId, account_id, session) => {

  // 1️⃣ Buscar nodo original
  const original = await FlowNode.findOne(
    { _id: nodeId, account_id },
    null,
    { session }
  );

  if (!original) throw new Error("Nodo no encontrado");

  // 2️⃣ Validar flow editable
  await getEditableFlow(original.flow_id, account_id);

  // 3️⃣ Obtener nuevo order
  const order = await getNextOrder(original.flow_id, account_id, session);

  // 4️⃣ Clonar opciones sin conexiones
  const clonedOptions = (original.options || []).map(opt => ({
    label: opt.label,
    value: opt.value,
    order: opt.order ?? 0,
    next_node_id: null // 🔥 CRÍTICO → limpiar conexiones
  }));

  // 5️⃣ Crear nuevo nodo limpio
  const [newNode] = await FlowNode.create(
    [{
      account_id,
      flow_id: original.flow_id,
      parent_node_id: null,
      order,
      node_type: original.node_type,
      content: original.content,
      variable_key: null, // 🔥 CRÍTICO → evitar duplicados
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

  // 6️⃣ Actualizar start node si aplica
  await updateStartNode(original.flow_id, account_id, session);

  return newNode;
};


// Eliminar nodos
exports.deleteNode = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const result = await flowNodeService.deleteNode(
      req.params.nodeId,
      req.user.account_id,
      session
    );

    await session.commitTransaction();
    res.json(result);
  } catch (err) {
    await session.abortTransaction();
    res.status(400).json({ message: err.message });
  } finally {
    session.endSession();
  }
};

// Reorden de nodos 
exports.reorderNodes = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    await flowNodeService.reorderNodes(
      req.params.flowId,
      req.body.nodes,
      req.user.account_id,
      session
    );

    await session.commitTransaction();
    res.json({ success: true });
  } catch (err) {
    await session.abortTransaction();
    res.status(400).json({ message: err.message });
  } finally {
    session.endSession();
  }
};
