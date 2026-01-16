const Flow = require("../models/Flow");
const Chatbot = require("../models/Chatbot");

exports.create = async (req, res) => {
  const chatbot = await Chatbot.findOne({
    _id: req.params.chatbotId,
    account_id: req.user.account_id
  });
  if (!chatbot) return res.status(404).json({ message: "Chatbot no válido" });

  const flow = await Flow.create({
    chatbot_id: chatbot._id,
    name: req.body.name
  });

  res.status(201).json(flow);
};

exports.findAll = async (req, res) => {
  const flows = await Flow.find({
    chatbot_id: req.params.chatbotId
  });
  res.json(flows);
};

exports.findOne = async (req, res) => {
  const flow = await Flow.findById(req.params.id);
  if (!flow) return res.status(404).json({ message: "No encontrado" });
  res.json(flow);
};

exports.update = async (req, res) => {
  const flow = await Flow.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  );
  if (!flow) return res.status(404).json({ message: "No encontrado" });
  res.json(flow);
};

exports.remove = async (req, res) => {
  const flow = await Flow.findByIdAndDelete(req.params.id);
  if (!flow) return res.status(404).json({ message: "No encontrado" });
  res.json({ message: "Flujo eliminado" });
};
