const mongoose = require("mongoose");
const Flow = require("../models/Flow");
const Chatbot = require("../models/Chatbot");
const FlowNode = require("../models/FlowNode");
const validateFlow = require("../services/validateFlow.service");
const { getEditableFlow } = require("../utils/flow.utils");


// Crear flow
exports.createFlow = async (req, res) => {
  try {
    const { chatbot_id, name } = req.body;

    if (!chatbot_id || !name) {
      return res.status(400).json({ message: "Datos incompletos" });
    }

    if (!isValidObjectId(chatbot_id)) {
      return res.status(400).json({ message: "chatbot_id inválido" });
    }

    const chatbot = await Chatbot.findOne({
      _id: chatbot_id,
      account_id: req.user.account_id
    });

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    const flow = await Flow.create({
      account_id: req.user.account_id,
      chatbot_id,
      name,
      is_active: false,
      is_draft: true,
      start_node_id: null,
      version: 0
    });

    res.status(201).json(flow);

  } catch (error) {
    console.error("createFlow:", error);
    res.status(500).json({ message: "Error al crear flow" });
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

    if (!isValidObjectId(chatbotId)) {
      return res.status(400).json({ message: "chatbotId inválido" });
    }

    const chatbot = await Chatbot.findOne({
      _id: chatbotId,
      account_id: req.user.account_id
    });

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    const flows = await Flow.find({ chatbot_id: chatbot._id });
    res.json(flows);

  } catch (error) {
    console.error("getFlowsByChatbot:", error);
    res.status(500).json({ message: "Error al obtener flows" });
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


// Guardar flow (borrador)
exports.saveFlow = async (req, res) => {
  try {
    const flow = await getEditableFlow(
      req.params.id,
      req.user.account_id
    );

    const { start_node_id, nodes } = req.body;

    if (start_node_id) {
      if (!isValidObjectId(start_node_id)) {
        return res.status(400).json({ message: "start_node_id inválido" });
      }

      const exists = await FlowNode.exists({
        _id: start_node_id,
        flow_id: flow._id,
        account_id: req.user.account_id
      });

      if (!exists) {
        return res.status(400).json({
          message: "start_node_id no pertenece al flow"
        });
      }

      flow.start_node_id = start_node_id;
    }

    if (!Array.isArray(nodes) || !nodes.length) {
      return res.status(400).json({ message: "El flow no tiene nodos" });
    }

    const bulk = nodes.map(n => ({
      updateOne: {
        filter: {
          _id: n.id || n._id,
          flow_id: flow._id,
          account_id: req.user.account_id
        },
        update: {
          content: n.content ?? null,
          options: n.node_type === "options" ? n.options ?? [] : [],
          next_node_id: n.next_node_id ?? null,
          parent_node_id: n.parent_node_id ?? null,
          order: n.order ?? 0,
          position: n.position ?? undefined,
          variable_key: n.variable_key ?? null,
          crm_field_key: n.crm_field_key ?? null,
          validation: n.validation ?? null,
          link_action: n.link_action ?? null,
          typing_time:
            typeof n.typing_time === "number"
              ? Math.min(10, Math.max(0, n.typing_time))
              : 2,
          is_draft: false
        }
      }
    }));

    if (bulk.length) {
      await FlowNode.bulkWrite(bulk);
    }

    flow.is_draft = true;
    await flow.save();

    res.json({ message: "Flow guardado correctamente" });

  } catch (error) {
    res.status(400).json({ message: error.message });
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
