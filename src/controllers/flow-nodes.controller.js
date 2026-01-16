const FlowNode = require("../models/FlowNode");
const Flow = require("../models/Flow");
const Chatbot = require("../models/Chatbot");

exports.create = async (req, res) => {
  const flow = await Flow.findById(req.params.flowId);
  if (!flow) return res.status(404).json({ message: "Flujo no existe" });

  // Validar que el flujo pertenece a la cuenta
  const chatbot = await Chatbot.findOne({
    _id: flow.chatbot_id,
    account_id: req.user.account_id
  });
  if (!chatbot) return res.status(403).json({ message: "Acceso denegado" });

  const node = await FlowNode.create({
    flow_id: flow._id,
    ...req.body
  });

  res.status(201).json(node);
};

exports.findAll = async (req, res) => {
  const nodes = await FlowNode.find({
    flow_id: req.params.flowId
  });
  res.json(nodes);
};

exports.findOne = async (req, res) => {
  const node = await FlowNode.findById(req.params.id);
  if (!node) return res.status(404).json({ message: "Nodo no encontrado" });
  res.json(node);
};

exports.update = async (req, res) => {
  const node = await FlowNode.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  );
  if (!node) return res.status(404).json({ message: "Nodo no encontrado" });
  res.json(node);
};

exports.remove = async (req, res) => {
  await FlowNode.findByIdAndDelete(req.params.id);

  // Limpieza de referencias
  await FlowNode.updateMany(
    { next_node_id: req.params.id },
    { $set: { next_node_id: null } }
  );

  await FlowNode.updateMany(
    { "options.next_node_id": req.params.id },
    { $set: { "options.$[].next_node_id": null } }
  );

  res.json({ message: "Nodo eliminado" });
};
