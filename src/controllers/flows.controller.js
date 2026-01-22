const mongoose = require("mongoose");
const Flow = require("../models/Flow");
const Chatbot = require("../models/Chatbot");
const FlowNode = require("../models/FlowNode");

const VALID_END_NODES = ["link"];
const INPUT_NODES = ["question", "email", "phone", "number"];

// Validar flow
const validateFlow = async (flow) => {
  const nodes = await FlowNode
    .find({ flow_id: flow._id })
    .lean(); // ⚡ mejora rendimiento

  // Debe existir start node y al menos un nodo
  if (!nodes.length || !flow.start_node_id) return false;

  const nodeMap = new Map(nodes.map(n => [String(n._id), n]));

  // Start node debe existir
  if (!nodeMap.has(String(flow.start_node_id))) return false;

  for (const node of nodes) {
    const nodeId = String(node._id);

    // Normalizar options
    const options = Array.isArray(node.options) ? node.options : [];

    /* INPUTS */
    if (INPUT_NODES.includes(node.node_type)) {
      if (!node.variable_key?.trim()) return false;
    }

    /* CRM FIELD solo inputs */
    if (node.crm_field_key && !INPUT_NODES.includes(node.node_type)) {
      return false;
    }

    /* TYPING TIME */
    if (
      node.typing_time !== undefined &&
      (node.typing_time < 0 || node.typing_time > 10)
    ) {
      return false;
    }

    /* OPTIONS */
    if (node.node_type === "options") {
      if (!options.length) return false;

      for (const opt of options) {
        if (!opt.label?.trim()) return false;
        if (!opt.next_node_id) return false;

        const nextId = String(opt.next_node_id);
        if (nextId === nodeId) return false;
        if (!nodeMap.has(nextId)) return false;
      }
    }

    /* JUMP */
    if (node.node_type === "jump") {
      if (options.length) return false;
      if (!node.next_node_id) return false;

      const nextId = String(node.next_node_id);
      if (nextId === nodeId) return false;
      if (!nodeMap.has(nextId)) return false;
    }

    /* LINK */
    if (node.node_type === "link") {
      if (!node.link_action?.type || !node.link_action?.value) {
        return false;
      }
    }

    /* CONEXIÓN OBLIGATORIA */
    if (
      !node.next_node_id &&
      !VALID_END_NODES.includes(node.node_type) &&
      node.node_type !== "options"
    ) {
      return false;
    }
  }

  // 🔁 Detectar ciclos
  const visited = new Set();

  const dfs = (id, path = new Set()) => {
    if (path.has(id)) return false;
    if (visited.has(id)) return true;

    visited.add(id);
    path.add(id);

    const node = nodeMap.get(id);
    if (!node) return true;

    const options = Array.isArray(node.options) ? node.options : [];

    if (node.node_type === "options") {
      for (const opt of options) {
        if (!dfs(String(opt.next_node_id), new Set(path))) return false;
      }
    } else if (node.next_node_id) {
      return dfs(String(node.next_node_id), new Set(path));
    }

    return true;
  };

  if (!dfs(String(flow.start_node_id))) return false;

  // 🚶‍♂️ Verificar nodos alcanzables
  const reachable = new Set();

  const walk = (id) => {
    if (reachable.has(id)) return;
    reachable.add(id);

    const node = nodeMap.get(id);
    if (!node) return;

    const options = Array.isArray(node.options) ? node.options : [];

    if (node.node_type === "options") {
      options.forEach(o => walk(String(o.next_node_id)));
    } else if (node.next_node_id) {
      walk(String(node.next_node_id));
    }
  };

  walk(String(flow.start_node_id));

  return reachable.size === nodes.length;
};

// Crear flow
exports.createFlow = async (req, res) => {
  try {
    const { chatbot_id, name } = req.body;

    if (!chatbot_id || !name) {
      return res.status(400).json({ message: "Datos incompletos" });
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
    res.status(500).json({ message: error.message });
  }
};

//Obtener flow por ID
exports.getFlowById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID inválido" });
    }

    // Validar flow + account
    const flow = await Flow.findOne({
      _id: id,
      account_id: req.user.account_id
    });

    if (!flow) {
      return res.status(404).json({ message: "Flow no encontrado" });
    }

    // Obtener nodos del flow
    const nodes = await FlowNode.find({ flow_id: id })
      .sort({ order: 1 })
      .lean();

    // Respuesta estructurada
    res.json({
      flow,
      nodes
    });

  } catch (error) {
    console.error("getFlowById error:", error);
    res.status(500).json({ message: "Error al obtener el flow" });
  }
};

// Obtener flows por chatbot
exports.getFlowsByChatbot = async (req, res) => {
  try {
    const chatbot = await Chatbot.findOne({
      _id: req.params.chatbotId,
      account_id: req.user.account_id
    });

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    const flows = await Flow.find({ chatbot_id: chatbot._id });
    res.json(flows);
  } catch (err) {
    res.status(500).json({ message: "Error al obtener flows" });
  }
};

// Actualizar flow
exports.updateFlow = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: "ID inválido" });
  }

  const flow = await Flow.findOne({
    _id: req.params.id,
    account_id: req.user.account_id
  });

  if (!flow) {
    return res.status(404).json({ message: "Flow no encontrado" });
  }

  if (flow.is_active) {
    return res.status(400).json({
      message: "No puedes modificar un flow publicado"
    });
  }

  flow.name = req.body.name ?? flow.name;
  await flow.save();

  res.json(flow);
};

// Eliminar flow
exports.deleteFlow = async (req, res) => {
  const flow = await Flow.findOne({
    _id: req.params.id,
    account_id: req.user.account_id
  });

  if (!flow) {
    return res.status(404).json({ message: "Flow no encontrado" });
  }

  if (flow.is_active) {
    return res.status(400).json({
      message: "No puedes eliminar un flow activo"
    });
  }

  await FlowNode.deleteMany({ flow_id: flow._id });
  await flow.deleteOne();

  res.json({ message: "Flow eliminado correctamente" });
};

// Guardar flow como publicado
exports.saveFlow = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: "ID inválido" });
  }

  const flow = await Flow.findOne({
    _id: req.params.id,
    account_id: req.user.account_id
  });

  if (!flow) {
    return res.status(404).json({ message: "Flow no encontrado" });
  }

  if (flow.is_active) {
    return res.status(400).json({
      message: "No puedes modificar un flow publicado"
    });
  }

  if (req.body.start_node_id) {
    if (!mongoose.Types.ObjectId.isValid(req.body.start_node_id)) {
      return res.status(400).json({ message: "start_node_id inválido" });
    }

    const exists = await FlowNode.exists({
      _id: req.body.start_node_id,
      flow_id: flow._id,
      account_id: req.user.account_id
    });

    if (!exists) {
      return res.status(400).json({ message: "start_node_id no pertenece al flow" });
    }

    flow.start_node_id = req.body.start_node_id;
  }


  const { nodes } = req.body;
  if (!Array.isArray(nodes)) {
    return res.status(400).json({ message: "nodes inválido" });
  }

  if (!nodes.length) {
    return res.status(400).json({ message: "El flow no tiene nodos" });
  }

  const nodeIds = nodes.map(n => n.id || n._id);

  const count = await FlowNode.countDocuments({
    _id: { $in: nodeIds },
    flow_id: flow._id,
    account_id: req.user.account_id
  });

  if (count !== nodeIds.length) {
    return res.status(400).json({
      message: "Uno o más nodos no existen o no pertenecen al flow"
    });
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
        options: n.node_type === "options" && Array.isArray(n.options) && n.options.length
          ? n.options
          : null,
        next_node_id: n.next_node_id ?? null,
        parent_node_id: n.parent_node_id ?? null,
        order: n.order ?? 0,
        ...(n.position && { position: n.position }),
        variable_key: n.variable_key ?? null,
        crm_field_key: n.crm_field_key ?? null,
        validation: n.validation ?? null,
        link_action: n.link_action ?? null,
        typing_time: typeof n.typing_time === "number"
          ? Math.min(10, Math.max(0, n.typing_time))
          : 2,
        is_draft: false
      }
    }
  }));

  if (bulk.length) await FlowNode.bulkWrite(bulk);

  flow.is_draft = true;
  flow.is_active = false;
  await flow.save();

  res.json({ message: "Cambios guardados correctamente" });
};

// Publicar flow
exports.publishFlow = async (req, res) => {
  try {
    const flow = await Flow.findOne({
      _id: req.params.id,
      account_id: req.user.account_id,
      is_active: false
    });

    if (!flow) {
      return res.status(404).json({ message: "Flow no publicable" });
    }

    const valid = await validateFlow(flow);
    if (!valid) {
      return res.status(400).json({
        message: "El flujo no es válido"
      });
    }

    await Flow.updateMany(
      { chatbot_id: flow.chatbot_id, _id: { $ne: flow._id } },
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
    res.status(500).json({ message: error.message });
  }
};

