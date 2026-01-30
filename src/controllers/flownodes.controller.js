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
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const node = await flowNodeService.connectNode({
      ...req.body,
      account_id: req.user.account_id,
      session
    });

    await session.commitTransaction();

    res.json(node);

  } catch (err) {

    await session.abortTransaction();
    res.status(400).json({ message: err.message });

  } finally {
    session.endSession();
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
exports.duplicateNode = async (req, res) => {

  const session = await mongoose.startSession();

  try {

    session.startTransaction();

    const newNode = await flowNodeService.duplicateNode(
      req.params.id,
      req.user.account_id,
      session
    );

    await session.commitTransaction();

    res.status(201).json(newNode);

  } catch (err) {

    await session.abortTransaction();
    res.status(400).json({ message: err.message });

  } finally {

    session.endSession();

  }
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
