const mongoose = require("mongoose");
const Flow = require("../models/Flow");
const Chatbot = require("../models/Chatbot");
const FlowNode = require("../models/FlowNode");
const validateFlow = require("../services/validateFlow.service");
const { getEditableFlow } = require("../utils/flow.utils");

// Crear flow
exports.createNode = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const {
      flow_id,
      node_type,
      content,
      options = [],
      variable_key,
      typing_time = 2,
      link_action,
      crm_field_key,
      validation
    } = req.body;

    if (!mongoose.Types.ObjectId.isValid(flow_id)) {
      throw new Error("flow_id requerido o inválido");
    }

    await getEditableFlow(flow_id, req.user.account_id);
    await validateCreateNode(req.body);

    if (typing_time < 0 || typing_time > 10) {
      throw new Error("typing_time inválido");
    }

    if (node_type === "options") {
      if (!Array.isArray(options) || options.length === 0) {
        throw new Error("Options requerido para node_type options");
      }

      for (const opt of options) {
        if (!opt.label || !opt.value) {
          throw new Error("Cada opción requiere label y value");
        }
      }
    }

    // 🔥 ORDEN CORRECTO (max + 1)
    const lastNode = await FlowNode.findOne({
      flow_id,
      account_id: req.user.account_id
    })
      .sort({ order: -1 })
      .select("order")
      .session(session);

    const order = lastNode ? lastNode.order + 1 : 0;

    const [node] = await FlowNode.create(
      [
        {
          account_id: req.user.account_id,
          flow_id,
          node_type,
          content: content ?? null,
          order,
          typing_time,
          variable_key: variable_key ?? null,
          crm_field_key: crm_field_key ?? null,
          validation: validation ?? null,
          link_action: link_action ? normalizeLinkAction(link_action) : null,
          next_node_id: null,
          options:
            node_type === "options"
              ? options.map((o, i) => ({
                  label: o.label.trim(),
                  value: o.value,
                  order: o.order ?? i,
                  next_node_id: null
                }))
              : [],
          is_draft: true
        }
      ],
      { session }
    );

    await updateStartNode(flow_id, req.user.account_id, session);

    await session.commitTransaction();
    res.status(201).json(node);

  } catch (error) {
    await session.abortTransaction();

    if (error.code === 11000) {
      return res.status(409).json({
        message: "Conflicto de orden al crear el nodo, intenta nuevamente"
      });
    }

    res.status(400).json({ message: error.message });

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

    const flow = await getEditableFlow(flowId, req.user.account_id);

    // 🔢 Orden secuencial seguro
    nodes
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .forEach((node, index) => {
        node.order = index;
      });

    // 🔄 ID MAP
    const idMap = new Map();
    nodes.forEach(node => {
      const newId = node._id
        ? new mongoose.Types.ObjectId(node._id)
        : new mongoose.Types.ObjectId();
      idMap.set(String(node._id), newId);
    });

    // 🧹 DELETE (CON SESSION CORRECTA)
    await FlowNode.deleteMany(
      {
        flow_id: flowId,
        account_id: req.user.account_id
      },
      { session }
    );

    // 🆕 PREPARE DOCS
    const docs = nodes.map(node => ({
      _id: idMap.get(String(node._id)),
      account_id: req.user.account_id,
      flow_id: flowId,
      parent_node_id: null,
      order: node.order,
      node_type: node.node_type,
      content: node.content,
      variable_key: node.variable_key || null,
      typing_time: node.typing_time ?? 2,
      crm_field_key: node.crm_field_key || null,
      is_draft: true,
      end_conversation: node.end_conversation ?? false,

      next_node_id: node.next_node_id
        ? idMap.get(String(node.next_node_id)) || null
        : null,

      options: (node.options || []).map(opt => ({
        label: opt.label,
        value: opt.value,
        order: opt.order ?? 0,
        next_node_id: opt.next_node_id
          ? idMap.get(String(opt.next_node_id)) || null
          : null
      })),

      link_action: node.link_action || undefined,
      validation: node.validation || undefined
    }));

    // 🔗 VALIDAR start_node_id
    const realStartId = idMap.get(String(start_node_id));
    if (!realStartId) {
      throw new Error("start_node_id no pertenece al flow");
    }

    await FlowNode.insertMany(docs, { session });

    flow.start_node_id = realStartId;
    flow.is_draft = true;
    await flow.save({ session });

    await session.commitTransaction();

    res.json({
      success: true,
      message: "Flow guardado correctamente"
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
