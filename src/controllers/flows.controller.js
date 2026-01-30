const mongoose = require("mongoose");
const Flow = require("../models/Flow");
const Chatbot = require("../models/Chatbot");
const FlowNode = require("../models/FlowNode");
const validateFlow = require("../services/validateFlow.service");
const { getEditableFlow } = require("../utils/flow.utils");

// Crear flow
exports.createFlow = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { chatbot_id, name } = req.body;

    // ✅ Validar antes de iniciar transaction pesada
    if (!chatbot_id || !name) {
      return res.status(400).json({
        message: "chatbot_id y name son requeridos"
      });
    }

    // Validar chatbot pertenezca a la cuenta
    const chatbot = await Chatbot.findOne({
      _id: chatbot_id,
      account_id: req.user.account_id
    });

    if (!chatbot) {
      return res.status(404).json({
        message: "Chatbot no encontrado"
      });
    }

    // 🚀 START TRANSACTION
    session.startTransaction();

    // ✅ create usando array → necesario para session
    const [flow] = await Flow.create([{
      account_id: req.user.account_id,
      chatbot_id,
      name,
      is_active: false,
      is_draft: true,
      start_node_id: null,
      version: 1
    }], { session });

    // ✅ Crear start node inicial
    const [startNode] = await FlowNode.create([{
      flow_id: flow._id,
      order: 0,
      node_type: "message",
      content: "Inicio del flujo",
      next_node_id: null,
      options: []
    }], { session });

    // ✅ Actualizar flow con start_node_id
    flow.start_node_id = startNode._id;
    await flow.save({ session });

    // ✅ Commit
    await session.commitTransaction();

    res.status(201).json(flow);

  } catch (error) {
    // ❌ Rollback seguro
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

    if (!isValidObjectId(id)) {
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
    const flow = await getEditableFlow(
      req.params.id,
      req.user.account_id
    );

    await FlowNode.deleteMany(
      { flow_id: flow._id },
      { session }
    );

    await flow.deleteOne({ session });

    await session.commitTransaction();
    session.endSession();

    res.json({ message: "Flow eliminado correctamente" });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(400).json({ message: error.message });
  }
};

// Guardar flow
exports.saveFlow = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const flowId = req.params.id;
    const { nodes, start_node_id } = req.body;

    if (!Array.isArray(nodes) || nodes.length === 0) {
      throw new Error("Nodes array requerido");
    }

    if (!mongoose.Types.ObjectId.isValid(start_node_id)) {
      throw new Error("start_node_id inválido");
    }

    // 🔐 Validar flow pertenece a la cuenta
    const flow = await getEditableFlow(flowId, req.user.account_id);

    // Validar orders únicos
    const orders = nodes.map(n => n.order);
    if (orders.length !== new Set(orders).size) {
      throw new Error("Orders duplicados detectados");
    }

    // ORDER-FIRST ENGINE
    nodes.sort((a, b) => a.order - b.order);

    // Obtener nodos existentes
    const existingNodes = await FlowNode.find({
      flow_id: flowId,
      account_id: req.user.account_id
    }).session(session);

    const existingMap = new Map(
      existingNodes.map(n => [n._id.toString(), n])
    );

    const savedNodeIds = [];

    // ================= UPSERT =================
    for (const node of nodes) {

      const nodePayload = {
        account_id: req.user.account_id,
        flow_id: flowId,
        node_type: node.node_type,
        content: node.content,
        order: node.order,
        options: node.options || [],
        next_node_id: node.next_node_id || null,
        variable_key: node.variable_key || null,
        typing_time: node.typing_time ?? 2,
        link_action: node.link_action || undefined,
        crm_field_key: node.crm_field_key || null,
        validation: node.validation || undefined
      };

      let savedNode;

      if (node._id && existingMap.has(node._id)) {

        savedNode = await FlowNode.findOneAndUpdate(
          {
            _id: node._id,
            flow_id: flowId,
            account_id: req.user.account_id
          },
          nodePayload,
          { new: true, session, runValidators: true }
        );

      } else {

        const created = await FlowNode.create([nodePayload], { session });
        savedNode = created[0];

      }

      savedNodeIds.push(savedNode._id.toString());
    }

    // ================= DELETE REMOVED =================
    for (const existingNode of existingNodes) {
      if (!savedNodeIds.includes(existingNode._id.toString())) {

        await FlowNode.deleteOne({
          _id: existingNode._id,
          flow_id: flowId,
          account_id: req.user.account_id
        }).session(session);

      }
    }

    // ================= VALIDAR START =================
    if (!savedNodeIds.includes(String(start_node_id))) {
      throw new Error("start_node_id no pertenece al flow");
    }

    // ================= UPDATE FLOW =================
    flow.start_node_id = start_node_id;
    flow.is_draft = true;

    await flow.save({ session });

    await session.commitTransaction();

    res.json({
      success: true,
      message: "Flow guardado (ORDER-FIRST + OPTIONS ENGINE)"
    });

  } catch (err) {

    await session.abortTransaction();

    res.status(400).json({
      success: false,
      message: err.message
    });

  } finally {
    session.endSession();
  }
};

// Publicar flow
exports.publishFlow = async (req, res) => {
  try {
    const flow = await getEditableFlow(
      req.params.id,
      req.user.account_id
    );

    await validateFlow(flow);

    await Flow.updateMany(
      {
        chatbot_id: flow.chatbot_id,
        _id: { $ne: flow._id }
      },
      { is_active: false }
    );

    flow.is_active = true;
    flow.is_draft = false;
    flow.version = (flow.version ?? 0) + 1;
    flow.published_at = new Date();

    await flow.save();

    res.json({ message: "Flow publicado correctamente" });

  } catch (error) {
    console.error("publishFlow:", error);
    res.status(400).json({
      message: error.message || "El flujo no es válido"
    });
  }
};
