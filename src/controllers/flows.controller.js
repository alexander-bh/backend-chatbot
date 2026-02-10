const mongoose = require("mongoose");
const Flow = require("../models/Flow");
const Chatbot = require("../models/Chatbot");
const FlowNode = require("../models/FlowNode");
const runtimeIntegrityEngine = require("../domain/runtimeIntegrityEngine");
const { acquireFlowLock, releaseFlowLock } = require("../utils/flowLock.engine");
const { getEditableFlow } = require("../utils/flow.utils");
const { validateFlow } = require("../validators/flow.validator");
const withTransactionRetry = require("../utils/withTransactionRetry");


// Crear flow
exports.createFlow = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { chatbot_id, name } = req.body;

    if (!chatbot_id || !name) {
      return res.status(400).json({
        message: "chatbot_id y name son requeridos"
      });
    }

    const chatbot = await Chatbot.findOne({
      _id: chatbot_id,
      account_id: req.user.account_id
    });

    if (!chatbot) {
      return res.status(404).json({
        message: "Chatbot no encontrado"
      });
    }

    session.startTransaction();

    const [flow] = await Flow.create([{
      account_id: req.user.account_id,
      chatbot_id,
      name,
      status: "draft",
      start_node_id: null,
      version: 1
    }], { session });

    const [startNode] = await FlowNode.create([{
      account_id: req.user.account_id,
      flow_id: flow._id,
      order: 0,
      node_type: "text",
      content: "Inicio del flujo",
      next_node_id: null,
      options: []
    }], { session });

    flow.start_node_id = startNode._id;
    await flow.save({ session });

    await session.commitTransaction();

    res.status(201).json(flow);

  } catch (error) {
    await session.abortTransaction();
    console.error("createFlow error:", error);
    res.status(500).json({
      message: "Error creando flow",
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

//Obtener flow por ID
exports.getFlowById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) { // ✅ FIX
      return res.status(400).json({ message: "ID inválido" });
    }

    const flow = await Flow.findOne({
      _id: id,
      account_id: req.user.account_id
    });

    if (!flow) {
      return res.status(404).json({ message: "Flow no encontrado" });
    }

    const nodes = await FlowNode.find({
      flow_id: id,
      account_id: req.user.account_id
    })
      .sort({ order: 1 })
      .lean();

    res.json({ flow, nodes });

  } catch (error) {
    console.error("getFlowById:", error);
    res.status(500).json({ message: "Error al obtener flow" });
  }
};

// Obtener flows por chatbot
exports.getFlowsByChatbot = async (req, res) => {
  try {
    const { chatbotId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(chatbotId)) {
      return res.status(400).json({ message: "chatbotId inválido" });
    }

    const chatbot = await Chatbot.findOne({
      _id: chatbotId,
      account_id: req.user.account_id
    });

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    const flows = await Flow.find({
      chatbot_id: chatbot._id,
      account_id: req.user.account_id
    });

    res.json(flows);

  } catch (error) {
    console.error("getFlowsByChatbot:", error);
    res.status(500).json({ message: error.message });
  }
};

// Actualizar flow
exports.updateFlow = async (req, res) => {
  try {
    const flow = await getEditableFlow(
      req.params.id,
      req.user.account_id
    );

    flow.name = req.body.name ?? flow.name;
    await flow.save();

    res.json(flow);

  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Eliminar flow
exports.deleteFlow = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const flow = await Flow.findOne({
      _id: req.params.id,
      account_id: req.user.account_id
    }).session(session);

    if (!flow) {
      throw new Error("Flow no encontrado");
    }

    await FlowNode.deleteMany(
      { flow_id: flow._id },
      { session }
    );

    await flow.deleteOne({ session });

    await session.commitTransaction();
    res.json({ message: "Flow eliminado correctamente" });

  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

exports.saveFlow = async (req, res) => {
  try {
    const flowId = req.params.id;
    const { nodes, start_node_id, publish = false } = req.body;

    const account_id = req.user.account_id;
    const user_id = req.user._id || req.user.id;

    if (!mongoose.Types.ObjectId.isValid(flowId)) {
      throw new Error("flowId inválido");
    }

    if (!Array.isArray(nodes) || nodes.length === 0) {
      throw new Error("nodes requeridos");
    }

    if (!mongoose.Types.ObjectId.isValid(start_node_id)) {
      throw new Error("start_node_id inválido");
    }

    const idMap = new Map();
    const validOldIds = new Set();

    nodes.forEach(n => {
      const oldId = String(n._id);
      validOldIds.add(oldId);
      idMap.set(oldId, new mongoose.Types.ObjectId());
      n.__old_id = oldId;
    });

    validateFlow(
      nodes.map(n => ({ ...n, _id: n.__old_id })),
      start_node_id
    );

    let flow;

    await withTransactionRetry(async session => {

      await acquireFlowLock({
        flow_id: flowId,
        user_id,
        account_id,
        session
      });

      flow = await getEditableFlow(flowId, account_id, session);

      await FlowNode.deleteMany(
        { flow_id: flowId, account_id },
        { session }
      );

      const docs = nodes.map(node => ({
        _id: idMap.get(node.__old_id),
        flow_id: flowId,
        account_id,
        order: node.order ?? 0,
        node_type: node.node_type,
        content: node.content ?? null,
        next_node_id:
          node.next_node_id &&
          validOldIds.has(String(node.next_node_id))
            ? idMap.get(String(node.next_node_id))
            : null,
        options: node.options ?? [],
        end_conversation: node.end_conversation === true,
        is_draft: !publish
      }));

      await FlowNode.insertMany(docs, { session });

      flow.start_node_id = idMap.get(String(start_node_id));
      flow.status = "draft";
      flow.lock = null;

      if (publish) {
        flow.version = (flow.version ?? 0) + 1;
        flow.published_at = new Date();
      }

      await flow.save({ session });
    });

    /* ───────── VALIDACIÓN POST-COMMIT ───────── */

    await runtimeIntegrityEngine(flow);

    res.json({
      success: true,
      message: publish
        ? "Flow guardado y publicado correctamente"
        : "Flow guardado correctamente"
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/* ===========================================================
   UNLOCK FLOW
=========================================================== */

exports.unlockFlow = async (req, res) => {

  const session = await mongoose.startSession();

  try {
    const flowId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(flowId)) {
      throw new Error("flowId inválido");
    }

    session.startTransaction();

    await releaseFlowLock({
      flow_id: flowId,
      user_id: req.user.id,
      account_id: req.user.account_id,
      session
    });

    await session.commitTransaction();

    res.json({
      success: true,
      message: "Flow desbloqueado correctamente"
    });

  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({
      success: false,
      message: error.message
    });
  } finally {
    session.endSession();
  }
};