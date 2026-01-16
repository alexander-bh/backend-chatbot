const Chatbot = require("../models/Chatbot");
const { v4: uuidv4 } = require("uuid");

exports.create = async (req, res) => {
  const chatbot = await Chatbot.create({
    account_id: req.user.account_id,
    public_id: uuidv4(),
    ...req.body
  });
  res.status(201).json(chatbot);
};

exports.findAll = async (req, res) => {
  const chatbots = await Chatbot.find({
    account_id: req.user.account_id
  });
  res.json(chatbots);
};

exports.findOne = async (req, res) => {
  const chatbot = await Chatbot.findOne({
    _id: req.params.id,
    account_id: req.user.account_id
  });
  if (!chatbot) return res.status(404).json({ message: "No encontrado" });
  res.json(chatbot);
};

exports.update = async (req, res) => {
  const chatbot = await Chatbot.findOneAndUpdate(
    { _id: req.params.id, account_id: req.user.account_id },
    req.body,
    { new: true }
  );
  if (!chatbot) return res.status(404).json({ message: "No encontrado" });
  res.json(chatbot);
};

exports.remove = async (req, res) => {
  const chatbot = await Chatbot.findOneAndDelete({
    _id: req.params.id,
    account_id: req.user.account_id
  });
  if (!chatbot) return res.status(404).json({ message: "No encontrado" });
  res.json({ message: "Chatbot eliminado" });
};
