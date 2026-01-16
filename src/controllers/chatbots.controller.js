const Chatbot = require("../models/Chatbot");
const connectDB = require("../config/database");
const { v4: uuidv4 } = require("uuid");

// Crear chatbot
exports.create = async (req, res) => {
  try {
    const chatbot = await Chatbot.create({
      public_id: uuidv4(),
      ...req.body
    });

    res.status(201).json(chatbot);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Obtener todos los chatbots
exports.findAll = async (req, res) => {
  try {
    await connectDB();

    const chatbots = await Chatbot.find().lean();

    res.json({
      success: true,
      total: chatbots.length,
      data: chatbots
    });
  } catch (error) {
    console.error("ERROR CHATBOTS:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Obtener uno
exports.findOne = async (req, res) => {
  try {
    await connectDB();

    const chatbot = await Chatbot.findOne({
      _id: req.params.id,
      account_id: req.user?.account_id
    });

    if (!chatbot) {
      return res.status(404).json({ message: "No encontrado" });
    }

    res.json(chatbot);
  } catch (error) {
    console.error("FIND ONE CHATBOT ERROR:", error);
    res.status(500).json({ error: error.message });
  }
};

// Actualizar
exports.update = async (req, res) => {
  try {
    await connectDB();

    const chatbot = await Chatbot.findOneAndUpdate(
      { _id: req.params.id, account_id: req.user?.account_id },
      req.body,
      { new: true, runValidators: true }
    );

    if (!chatbot) {
      return res.status(404).json({ message: "No encontrado" });
    }

    res.json(chatbot);
  } catch (error) {
    console.error("UPDATE CHATBOT ERROR:", error);
    res.status(500).json({ error: error.message });
  }
};

// Eliminar
exports.remove = async (req, res) => {
  try {
    await connectDB();

    const chatbot = await Chatbot.findOneAndDelete({
      _id: req.params.id,
      account_id: req.user?.account_id
    });

    if (!chatbot) {
      return res.status(404).json({ message: "No encontrado" });
    }

    res.json({ message: "Chatbot eliminado" });
  } catch (error) {
    console.error("DELETE CHATBOT ERROR:", error);
    res.status(500).json({ error: error.message });
  }
};
