const Flow = require("../models/Flow");
const Chatbot = require("../models/Chatbot");
const FlowNode = require("../models/FlowNode");

const VALID_END_NODES = ["text", "link"];

const validateFlow = async (flow) => {
  const nodes = await FlowNode.find({ flow_id: flow._id });

  if (!nodes.length) return false;
  if (!flow.start_node_id) return false;

  const nodeMap = new Map();
  nodes.forEach(n => nodeMap.set(String(n._id), n));

  // 🔴 start_node_id debe existir
  if (!nodeMap.has(String(flow.start_node_id))) return false;

  // 🔗 Validaciones por nodo
  for (const node of nodes) {

    // Inputs requieren variable_key
    if (
      ["question", "email", "phone", "number"].includes(node.node_type)
    ) {
      if (!node.variable_key) return false;
    }

    // crm_field_key solo permitido en inputs
    if (
      node.crm_field_key &&
      !["question", "email", "phone", "number"].includes(node.node_type)
    ) {
      return false;
    }

    // typing_time válido
    if (node.typing_time < 0 || node.typing_time > 10) return false;

    // OPTIONS
    if (node.node_type === "options") {
      if (!node.options?.length) return false;

      for (const opt of node.options) {
        if (!opt.label?.trim()) return false;
        if (!opt.next_node_id) return false;
        if (!nodeMap.has(String(opt.next_node_id))) return false;
      }
    }

    // JUMP
    if (node.node_type === "jump") {
      if (!node.next_node_id) return false;
      if (!nodeMap.has(String(node.next_node_id))) return false;
    }

    // LINK
    if (node.node_type === "link") {
      if (!node.link_action?.type || !node.link_action?.value) {
        return false;
      }
    }

    // Conexión obligatoria si no es nodo final
    if (
      !node.next_node_id &&
      !VALID_END_NODES.includes(node.node_type) &&
      node.node_type !== "options"
    ) {
      return false;
    }
  }

  // 🔁 Detectar ciclos infinitos
  const visited = new Set();

  const dfs = (nodeId, path = new Set()) => {
    if (path.has(nodeId)) return false;
    if (visited.has(nodeId)) return true;

    path.add(nodeId);
    visited.add(nodeId);

    const node = nodeMap.get(nodeId);
    if (!node) return true;

    if (node.node_type === "options") {
      for (const opt of node.options) {
        if (!dfs(String(opt.next_node_id), new Set(path))) {
          return false;
        }
      }
    } else if (node.next_node_id) {
      return dfs(String(node.next_node_id), new Set(path));
    }

    return true;
  };

  if (!dfs(String(flow.start_node_id))) return false;

  // 🧭 Detectar nodos inalcanzables
  const reachable = new Set();

  const walk = (nodeId) => {
    if (reachable.has(nodeId)) return;
    reachable.add(nodeId);

    const node = nodeMap.get(nodeId);
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

// ================= CONTROLLERS =================

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
    start_node_id: null
  });

  res.status(201).json(flow);
};

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

exports.updateFlow = async (req, res) => {
  const flow = await Flow.findById(req.params.id);
  if (!flow) return res.status(404).json({ message: "Flow no encontrado" });

  flow.name = req.body.name ?? flow.name;

  if (req.body.is_active !== undefined) {
    return res.status(400).json({
      message: "Usa publishFlow para activar un flujo"
    });
  }

  await flow.save();
  res.json(flow);
};

exports.deleteFlow = async (req, res) => {
  const flow = await Flow.findById(req.params.id);
  if (!flow) return res.status(404).json({ message: "Flow no encontrado" });

  if (flow.is_active) {
    return res.status(400).json({
      message: "No puedes eliminar un flow activo"
    });
  }

  await FlowNode.deleteMany({ flow_id: flow._id });
  await Flow.findByIdAndDelete(flow._id);

  res.json({ message: "Flow y nodos eliminados" });
};

exports.publishFlow = async (req, res) => {
  try {
    const flow = await Flow.findById(req.params.id);
    if (!flow) {
      return res.status(404).json({ message: "Flow no encontrado" });
    }

    const valid = await validateFlow(flow);
    if (!valid) {
      return res.status(400).json({
        message: "El flujo no es válido (estructura o conexiones)"
      });
    }

    const chatbot = await Chatbot.findOne({
      _id: flow.chatbot_id,
      account_id: req.user.account_id
    });

    if (!chatbot) {
      return res.status(403).json({ message: "No autorizado" });
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
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al publicar flujo" });
  }
};
