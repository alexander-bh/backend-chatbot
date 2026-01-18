const Flow = require("../models/Flow");
const Chatbot = require("../models/Chatbot");
const FlowNode = require("../models/FlowNode");


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

  const flow = await Flow.create({ chatbot_id, name });
  res.status(201).json(flow);
};

exports.getFlowsByChatbot = async (req, res) => {
  const { chatbotId } = req.params;

  const flows = await Flow.find({ chatbot_id: chatbotId });
  res.json(flows);
};

exports.updateFlow = async (req, res) => {
  const flow = await Flow.findById(req.params.id);

  if (!flow) {
    return res.status(404).json({ message: "Flow no encontrado" });
  }

  flow.name = req.body.name ?? flow.name;
  flow.is_active = req.body.is_active ?? flow.is_active;

  await flow.save();
  res.json(flow);
};

exports.deleteFlow = async (req, res) => {
  await Flow.findByIdAndDelete(req.params.id);
  res.json({ message: "Flow eliminado" });
};


const validateFlow = async (flow_id) => {
  const nodes = await FlowNode.find({ flow_id });

  for (const node of nodes) {
    if (node.node_type === "options") {
      for (const opt of node.options) {
        if (!opt.next_node_id) return false;
      }
    }

    if (
      node.node_type !== "options" &&
      !node.next_node_id &&
      node.node_type !== "text"
    ) {
      return false;
    }
  }

  return true;
};

exports.publishFlow = async (req, res) => {
  try {
    const valid = await validateFlow(req.params.id);

    if (!valid) {
      return res.status(400).json({
        message: "El flujo tiene nodos sin conexión"
      });
    }

    await Flow.findByIdAndUpdate(req.params.id, {
      is_active: true,
      is_draft: false
    });

    res.json({ message: "Flujo publicado correctamente" });
  } catch (error) {
    res.status(500).json({ message: "Error al publicar flujo" });
  }
};