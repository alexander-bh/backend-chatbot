const Chatbot = require("../models/Chatbot");
const crypto = require("crypto");
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
      public_id: crypto.randomUUID()
    });

    await ChatbotSettings.create({
      chatbot_id: chatbot._id,
      avatar: process.env.DEFAULT_CHATBOT_AVATAR,
      primary_color: "#2563eb",
      secondary_color: "#111827",
      launcher_text: "¿Te ayudo?",
      bubble_style: "rounded",
      font: "inter",
      position: {
        type: "bottom-right",
        offset_x: 24,
        offset_y: 24
      },
      is_enabled: true
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
