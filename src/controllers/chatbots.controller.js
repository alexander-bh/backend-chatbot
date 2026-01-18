const Chatbot = require("../models/Chatbot");
const { v4: uuidv4 } = require("uuid");
const ChatbotSettings = require("../models/ChatbotSettings");


exports.createChatbot = async (req, res) => {
  try {
    const { name, welcome_message } = req.body;

    if (!name) {
      return res.status(400).json({ message: "El nombre es obligatorio" });
    }

    const chatbot = await Chatbot.create({
      account_id: req.user.account_id,
      name,
      welcome_message: welcome_message || "Hola 👋 ¿en qué puedo ayudarte?",
      public_id:uuidv4()
    });

    await ChatbotSettings.create({
      chatbot_id: chatbot._id
    });

    res.status(201).json(chatbot);
  } catch (error) {
    console.error("CREATE CHATBOT ERROR:", error);
    res.status(500).json({ message: "Error al crear chatbot" });
  }
};



exports.listChatbots = async (req, res) => {
  const chatbots = await Chatbot.find({
    account_id: req.user.account_id
  }).sort({ created_at: -1 });

  res.json(chatbots);
};


exports.updateChatbot = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, welcome_message, status } = req.body;

    const chatbot = await Chatbot.findOne({
      _id: id,
      account_id: req.user.account_id
    });

    if (!chatbot) {
      return res.status(404).json({
        message: "Chatbot no encontrado"
      });
    }

    if (name !== undefined) chatbot.name = name;
    if (welcome_message !== undefined) chatbot.welcome_message = welcome_message;
    if (status !== undefined) chatbot.status = status;

    await chatbot.save();

    res.json(chatbot);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


exports.deleteChatbot = async (req, res) => {
  try {
    const { id } = req.params;

    const chatbot = await Chatbot.findOneAndDelete({
      _id: id,
      account_id: req.user.account_id
    });

    if (!chatbot) {
      return res.status(404).json({
        message: "Chatbot no encontrado"
      });
    }

    res.json({
      message: "Chatbot eliminado correctamente"
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
