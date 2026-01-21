const mongoose = require("mongoose");
const Flow = require("../models/Flow");
const Chatbot = require("../models/Chatbot");
const FlowNode = require("../models/FlowNode");

const VALID_END_NODES = ["text", "link"];
const INPUT_NODES = ["question", "email", "phone", "number"];

/* ======================================================
   VALIDAR ESTRUCTURA DEL FLOW
====================================================== */
const validateFlow = async (flow) => {
  const nodes = await FlowNode.find({ flow_id: flow._id });
  if (!nodes.length || !flow.start_node_id) return false;

  const nodeMap = new Map(nodes.map(n => [String(n._id), n]));

  if (!nodeMap.has(String(flow.start_node_id))) return false;

  for (const node of nodes) {
    // Inputs
    if (INPUT_NODES.includes(node.node_type)) {
      if (!node.variable_key) return false;
    }

    // CRM field solo en inputs
    if (node.crm_field_key && !INPUT_NODES.includes(node.node_type)) {
      return false;
    }

    if (node.typing_time < 0 || node.typing_time > 10) return false;

    // Options
    if (node.node_type === "options") {
      if (!node.options?.length) return false;

      for (const opt of node.options) {
        if (!opt.label?.trim()) return false;
        if (!opt.next_node_id) return false;
        if (!nodeMap.has(String(opt.next_node_id))) return false;
      }
    }

    // Jump
    if (node.node_type === "jump") {
      if (!node.next_node_id) return false;
      if (!nodeMap.has(String(node.next_node_id))) return false;
    }

    // Link
    if (node.node_type === "link") {
      if (!node.link_action?.type || !node.link_action?.value) return false;
    }

    // Conexión obligatoria
    if (
      !node.next_node_id &&
      !VALID_END_NODES.includes(node.node_type) &&
      node.node_type !== "options"
    ) {
      return false;
    }
  }

  // Detectar ciclos
  const visited = new Set();

  const dfs = (id, path = new Set()) => {
    if (path.has(id)) return false;
    if (visited.has(id)) return true;

    visited.add(id);
    path.add(id);

    const node = nodeMap.get(id);
    if (!node) return true;

    if (node.node_type === "options") {
      for (const opt of node.options) {
        if (!dfs(String(opt.next_node_id), new Set(path))) return false;
      }
    } else if (node.next_node_id) {
      return dfs(String(node.next_node_id), new Set(path));
    }

    return true;
  };

  if (!dfs(String(flow.start_node_id))) return false;

  // Detectar nodos inalcanzables
  const reachable = new Set();

  const walk = (id) => {
    if (reachable.has(id)) return;
    reachable.add(id);

    const node = nodeMap.get(id);
    if (!node) return;

    if (node.node_type === "options") {
      node.options.forEach(o => walk(String(o.next_node_id)));
    } else if (node.next_node_id) {
      walk(String(node.next_node_id));
    }
  };

  walk(String(flow.start_node_id));
  return reachable.size === nodes.length;
};

/* ======================================================
   CREATE FLOW
====================================================== */
exports.createFlow = async (req, res) => {
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
    chatbot_id,
    name,
    is_active: false,
    is_draft: true,
    start_node_id: null,
    version: 1
  });

  res.status(201).json(flow);
};

//Obtener flow por ID
exports.getFlowById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID inválido" });
    }

    // 1️⃣ Validar flow + account
    const flow = await Flow.findOne({
      _id: id,
      account_id: req.user.account_id
    });

    if (!flow) {
      return res.status(404).json({ message: "Flow no encontrado" });
    }

    // 2️⃣ Obtener nodos del flow
    const nodes = await FlowNode.find({ flow_id: id })
      .sort({ parent_node_id: 1, order: 1 })
      .lean();

    // 3️⃣ Respuesta estructurada
    res.json({
      flow,
      nodes
    });

  } catch (error) {
    console.error("getFlowById error:", error);
    res.status(500).json({ message: "Error al obtener el flow" });
  }
};


/* ======================================================
   GET FLOWS
====================================================== */
exports.getFlowsByChatbot = async (req, res) => {
  const chatbot = await Chatbot.findOne({
    _id: req.params.chatbotId,
    account_id: req.user.account_id
  });

  if (!chatbot) {
    return res.status(404).json({ message: "Chatbot no encontrado" });
  }

  const flows = await Flow.find({ chatbot_id: chatbot._id });
  res.json(flows);
};

/* ======================================================
   UPDATE FLOW
====================================================== */
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

/* ======================================================
   DELETE FLOW
====================================================== */
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

/* ======================================================
   SAVE FLOW (BOTÓN VERDE)
====================================================== */
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

  const { nodes } = req.body;
  if (!Array.isArray(nodes)) {
    return res.status(400).json({ message: "nodes inválido" });
  }

  const bulk = nodes.map(n => ({
    updateOne: {
      filter: { _id: n.id, flow_id: flow._id },
      update: {
        content: n.content ?? null,
        options: n.options ?? null,
        next_node_id: n.next_node_id ?? null,
        parent_node_id: n.parent_node_id ?? null,
        order: n.order ?? 0,
        position: n.position ?? undefined,
        variable_key: n.variable_key ?? null,
        crm_field_key: n.crm_field_key ?? null,
        validation: n.validation ?? null,
        link_action: n.link_action ?? null,
        typing_time: n.typing_time ?? 2,
        is_draft: false
      }
    }
  }));

  if (bulk.length) await FlowNode.bulkWrite(bulk);

  flow.is_draft = true;
  flow.updated_at = new Date();
  await flow.save();

  res.json({ message: "Cambios guardados correctamente" });
};

/* ======================================================
   PUBLISH FLOW
====================================================== */
exports.publishFlow = async (req, res) => {
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
      message: "Este flow ya está publicado"
    });
  }

  const valid = await validateFlow(flow);
  if (!valid) {
    return res.status(400).json({
      message: "El flujo no es válido (estructura o conexiones)"
    });
  }

  await Flow.updateMany(
    { chatbot_id: flow.chatbot_id, _id: { $ne: flow._id } },
    { is_active: false }
  );

  flow.is_active = true;
  flow.is_draft = false;
  flow.published_at = new Date();
  flow.version += 1;

  await flow.save();

  res.json({ message: "Flujo publicado correctamente" });
};
