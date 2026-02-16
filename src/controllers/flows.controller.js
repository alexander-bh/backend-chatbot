const mongoose = require("mongoose");
const Flow = require("../models/Flow");
const Chatbot = require("../models/Chatbot");
const FlowNode = require("../models/FlowNode");
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

// controllers/flow.controller.js
exports.saveFlow = async (req, res) => {
  try {
    const flowId = req.params.id;
    const { nodes, start_node_id, publish = false, chatbot_id } = req.body;

    const account_id = req.user.account_id;
    const user_id = req.user._id || req.user.id;

    /* ================= VALIDACIONES BÁSICAS ================= */

    if (!mongoose.Types.ObjectId.isValid(flowId)) {
      throw new Error("flowId inválido");
    }

    if (!mongoose.Types.ObjectId.isValid(chatbot_id)) {
      throw new Error("chatbot_id requerido");
    }

    if (!Array.isArray(nodes) || nodes.length === 0) {
      throw new Error("El flujo debe contener al menos un nodo");
    }

    /* ================= NORMALIZAR NODOS ================= */

    const idMap = new Map();
    const validOldIds = new Set();

    nodes.forEach((n, index) => {
      // Permitir ids temporales o generar uno si no existe
      const oldId = n._id
        ? String(n._id)
        : new mongoose.Types.ObjectId().toString();

      n.__old_id = oldId;
      validOldIds.add(oldId);

      // Generar nuevo ObjectId real para Mongo
      idMap.set(oldId, new mongoose.Types.ObjectId());

      // Forzar orden consistente
      n.order = index;

      if (!n.node_type) {
        throw new Error(`Nodo en posición ${index} sin node_type`);
      }
    });

    /* ================= VALIDAR START NODE ================= */

    let finalStartNodeId = start_node_id;

    if (!start_node_id || !validOldIds.has(String(start_node_id))) {
      // usar el primer nodo por orden
      const firstNode = nodes
        .slice()
        .sort((a, b) => a.order - b.order)[0];

      finalStartNodeId = firstNode.__old_id;
    }

    /* ================= VALIDAR ESTRUCTURA ================= */

    validateFlow(
      nodes.map(n => ({ ...n, _id: n.__old_id })),
      finalStartNodeId
    );

    /* ================= TRANSACTION ================= */

    await withTransactionRetry(async session => {

      await acquireFlowLock({
        flow_id: flowId,
        user_id,
        account_id,
        session
      });

      const flow = await getEditableFlow(flowId, account_id, session);
      const isPublishing = publish === true;

      /* ================= LIMPIAR NODOS ANTERIORES ================= */

      await FlowNode.deleteMany(
        {
          flow_id: flowId,
          account_id,
          ...(isPublishing ? {} : { is_draft: true })
        },
        { session }
      );

      /* ================= CONSTRUIR DOCUMENTOS ================= */

      const INPUT_NODES = ["text_input", "email", "phone", "number"];

      const docs = nodes.map(node => {
        const base = {
          _id: idMap.get(node.__old_id),
          flow_id: flowId,
          account_id,
          order: node.order,
          node_type: node.node_type,
          content: node.content ?? "",
          typing_time: node.typing_time ?? 2,
          next_node_id:
            node.next_node_id &&
            validOldIds.has(String(node.next_node_id))
              ? idMap.get(String(node.next_node_id))
              : null,
          end_conversation: node.end_conversation === true,
          meta: node.meta ?? {},
          is_draft: !isPublishing
        };

        /* OPTIONS */
        if (node.node_type === "options") {
          base.options = (node.options ?? []).map(opt => ({
            ...opt,
            next_node_id:
              opt.next_node_id &&
              validOldIds.has(String(opt.next_node_id))
                ? idMap.get(String(opt.next_node_id))
                : null
          }));
        }

        /* INPUTS */
        if (INPUT_NODES.includes(node.node_type)) {
          base.variable_key = node.variable_key ?? null;
          base.validation = node.validation ?? undefined;
          base.crm_field_key = node.crm_field_key ?? undefined;
        }

        /* LINK */
        if (node.node_type === "link") {
          base.link_action = node.link_action ?? undefined;
        }

        /* DATA POLICY */
        if (node.node_type === "data_policy") {
          base.policy = node.policy ?? undefined;
        }

        return base;
      });

      await FlowNode.insertMany(docs, { session });

      /* ================= ACTUALIZAR FLOW ================= */

      flow.chatbot_id = chatbot_id;
      flow.start_node_id = idMap.get(String(finalStartNodeId));
      flow.lock = null;

      if (isPublishing) {
        flow.status = "draft";
        flow.version = (flow.version ?? 0) + 1;
        flow.published_at = new Date();
      } else {
        flow.status = "draft";
      }

      await flow.save({ session });
    });

    return res.json({
      success: true,
      message: publish
        ? "Flow publicado correctamente"
        : "Flow guardado como borrador"
    });

  } catch (error) {

    console.error("SAVE FLOW ERROR:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Error al guardar el flujo"
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