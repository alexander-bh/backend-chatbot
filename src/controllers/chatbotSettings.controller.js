const ChatbotSettings = require("../models/ChatbotSettings");
const Chatbot = require("../models/Chatbot");
const cloudinary = require("cloudinary").v2;

exports.uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Archivo requerido" });
    }

    const chatbot = await Chatbot.findOne({
      _id: req.params.id,
      account_id: req.user.account_id
    });

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    const settings = await ChatbotSettings.findOne({
      chatbot_id: chatbot._id
    });

    if (!settings) {
      return res.status(404).json({ message: "Settings no encontrados" });
    }

    if (
      settings.avatar &&
      !settings.avatar.includes("Captura_de_pantalla_2025")
    ) {
      const publicId = settings.avatar
        .split("/")
        .pop()
        .split(".")[0];

      await cloudinary.uploader.destroy(publicId);
    }

    settings.avatar = req.file.path;
    await settings.save();

    res.json({
      avatar: settings.avatar
    });
  } catch (error) {
    console.error("UPLOAD AVATAR ERROR:", error);
    res.status(500).json({ message: "Error al subir avatar" });
  }
};

exports.getSettings = async (req, res) => {
  try {
    const chatbot = await Chatbot.findOne({
      _id: req.params.id,
      account_id: req.user.account_id
    });

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    const settings = await ChatbotSettings.findOne({
      chatbot_id: chatbot._id
    });

    if (!settings) {
      return res.status(404).json({ message: "Settings no encontrados" });
    }

    res.json(settings);
  } catch (error) {
    console.error("GET SETTINGS ERROR:", error);
    res.status(500).json({ message: "Error al obtener settings" });
  }
};


exports.updateSettings = async (req, res) => {
  try {
    const chatbot = await Chatbot.findOne({
      _id: req.params.id,
      account_id: req.user.account_id
    });

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    const settings = await ChatbotSettings.findOne({
      chatbot_id: chatbot._id
    });

    if (!settings) {
      return res.status(404).json({ message: "Settings no encontrados" });
    }

    // Campos permitidos para actualizar
    const allowedFields = [
      "primary_color",
      "secondary_color",
      "launcher_text",
      "bubble_style",
      "font",
      "is_enabled",
      "position"
    ];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        settings[field] = req.body[field];
      }
    });

    await settings.save();

    res.json(settings);
  } catch (error) {
    console.error("UPDATE SETTINGS ERROR:", error);
    res.status(500).json({ message: "Error al actualizar settings" });
  }
};