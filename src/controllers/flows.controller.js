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
      account_id: req.user.account_id, // ✅ FIX
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

// Guardar flow
exports.saveFlow = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const flowId = req.params.id;
    const { nodes, start_node_id } = req.body;

    /* ───────── VALIDACIONES BASE ───────── */
    if (!mongoose.Types.ObjectId.isValid(flowId)) {
      throw new Error("flowId inválido");
    }

    if (!Array.isArray(nodes) || nodes.length === 0) {
      throw new Error("Nodes array requerido");
    }

    if (!mongoose.Types.ObjectId.isValid(start_node_id)) {
      throw new Error("start_node_id inválido");
    }

    const flow = await getEditableFlow(flowId, req.user.account_id);

    /* ───────── HELPERS ───────── */
    const ALLOWED_TYPES = [
      "text",
      "question",
      "email",
      "phone",
      "number",
      "text_input",
      "options",
      "jump",
      "link"
    ];

    const normalizeEmails = (emails) =>
      Array.isArray(emails)
        ? [...new Set(emails)]
            .map(e => e.toLowerCase().trim())
            .filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
        : [];

    /* ───────── VALIDAR NODOS (ANTES DE BORRAR) ───────── */

    // node_type
    nodes.forEach(node => {
      if (!ALLOWED_TYPES.includes(node.node_type)) {
        throw new Error(`node_type inválido: ${node.node_type}`);
      }
    });

    // variable_key duplicado
    const variableKeys = new Set();
    nodes.forEach(node => {
      if (node.variable_key) {
        if (variableKeys.has(node.variable_key)) {
          throw new Error(`variable_key duplicado: ${node.variable_key}`);
        }
        variableKeys.add(node.variable_key);
      }
    });

    // validar notificaciones
    nodes.forEach(node => {
      if (node.meta?.notify?.enabled) {
        const recipients = normalizeEmails(
          node.meta.notify.recipients || []
        );

        if (recipients.length === 0) {
          throw new Error(
            `Nodo ${node._id || "[nuevo]"} tiene notify habilitado sin correos válidos`
          );
        }
      }
    });

    // validar start_node_id pertenece al flow
    const nodeIds = nodes.map(n => String(n._id));
    if (!nodeIds.includes(String(start_node_id))) {
      throw new Error("start_node_id no pertenece al flow");
    }

    /* ───────── ORDEN ESTABLE ───────── */
    nodes
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .forEach((node, index) => {
        node.order = index;
      });

    /* ───────── MAPEO DE IDS ───────── */
    const idMap = new Map();
    const validOldIds = new Set();

    nodes.forEach(node => {
      const oldId = node._id
        ? String(node._id)
        : new mongoose.Types.ObjectId().toString();

      validOldIds.add(oldId);
      idMap.set(oldId, new mongoose.Types.ObjectId());
      node.__old_id = oldId;
    });

    /* ───────── BORRAR SOLO DESPUÉS DE VALIDAR ───────── */
    await FlowNode.deleteMany(
      { flow_id: flowId, account_id: req.user.account_id },
      { session }
    );

    /* ───────── RECONSTRUIR NODOS ───────── */
    const docs = nodes.map(node => ({
      _id: idMap.get(node.__old_id),
      account_id: req.user.account_id,
      flow_id: flowId,
      order: node.order,
      node_type: node.node_type,
      content: node.content ?? null,
      variable_key: node.variable_key ?? null,
      typing_time: node.typing_time ?? 2,
      crm_field_key: node.crm_field_key ?? null,
      is_draft: true,
      end_conversation: node.end_conversation ?? false,

      parent_node_id:
        node.parent_node_id && validOldIds.has(String(node.parent_node_id))
          ? idMap.get(String(node.parent_node_id))
          : null,

      next_node_id:
        node.next_node_id && validOldIds.has(String(node.next_node_id))
          ? idMap.get(String(node.next_node_id))
          : null,

      options: (node.options || []).map(opt => ({
        label: opt?.label ?? "",
        value: opt?.value ?? "",
        order: opt?.order ?? 0,
        next_node_id:
          opt?.next_node_id && validOldIds.has(String(opt.next_node_id))
            ? idMap.get(String(opt.next_node_id))
            : null
      })),

      link_action: node.link_action || undefined,
      validation: node.validation || undefined,

      meta: node.meta
        ? {
            ...node.meta,
            notify: node.meta.notify
              ? {
                  ...node.meta.notify,
                  recipients: normalizeEmails(
                    node.meta.notify.recipients || []
                  )
                }
              : undefined
          }
        : {}
    }));

    const realStartId = idMap.get(String(start_node_id));

    await FlowNode.insertMany(docs, { session });

    flow.start_node_id = realStartId;
    flow.status = "draft";
    await flow.save({ session });

    await session.commitTransaction();

    res.json({
      success: true,
      message: "Flow guardado correctamente"
    });

  } catch (err) {
    await session.abortTransaction();
    res.status(err.code === 11000 ? 409 : 400).json({
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
        account_id: req.user.account_id,
        _id: { $ne: flow._id }
      },
      { status: "archived" }
    );

    flow.status = "active";
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

