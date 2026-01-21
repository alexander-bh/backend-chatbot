const ChatbotSettings = require("../models/ChatbotSettings");
const Chatbot = require("../models/Chatbot");
const avatars = require("../config/chatbotAvatars");
const cloudinary = require("cloudinary").v2;

/* ─────────────── HELPERS ─────────────── */
const isUploadedAvatar = avatar =>
  avatar && avatar.includes("/chatbots/avatars/");

/* ─────────────── SUBIR AVATAR ─────────────── */
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

    let settings = await ChatbotSettings.findOne({
      chatbot_id: chatbot._id
    });

    if (!settings) {
      settings = new ChatbotSettings({
        chatbot_id: chatbot._id
      });
    }

    // Borrar avatar anterior SOLO si fue subido
    if (isUploadedAvatar(settings.avatar)) {
      const publicId = settings.avatar
        .split("/upload/")[1]
        .split(".")[0];

      await cloudinary.uploader.destroy(publicId);
    }

    settings.avatar = req.file.path;
    await settings.save();

    res.json({ avatar: settings.avatar });

  } catch (error) {
    console.error("UPLOAD AVATAR ERROR:", error);
    res.status(500).json({ message: "Error al subir avatar" });
  }
};

/* ─────────────── OBTENER SETTINGS ─────────────── */
exports.getSettings = async (req, res) => {
  try {
    const chatbot = await Chatbot.findOne({
      _id: req.params.id,
      account_id: req.user.account_id
    });

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    let settings = await ChatbotSettings.findOne({
      chatbot_id: chatbot._id
    });

    if (!settings) {
      settings = await ChatbotSettings.create({
        chatbot_id: chatbot._id
      });
    }

    res.json(settings);

  } catch (error) {
    console.error("GET SETTINGS ERROR:", error);
    res.status(500).json({ message: "Error al obtener settings" });
  }
};

/* ─────────────── ACTUALIZAR SETTINGS (UNIFICADO) ─────────────── */
exports.updateChatbotSettings = async (req, res) => {
  try {
    /* Chatbot */
    const chatbot = await Chatbot.findOne({
      _id: req.params.id,
      account_id: req.user.account_id
    });

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    /* Settings */
    let settings = await ChatbotSettings.findOne({
      chatbot_id: chatbot._id
    });

    if (!settings) {
      settings = new ChatbotSettings({
        chatbot_id: chatbot._id
      });
    }

    /* Avatar subido */
    if (req.file) {
      if (isUploadedAvatar(settings.avatar)) {
        const publicId = settings.avatar
          .split("/upload/")[1]
          .split(".")[0];

        await cloudinary.uploader.destroy(publicId);
      }

      settings.avatar = req.file.path;
    }

    /* Parse settings */
    let incomingSettings = req.body;
    if (req.body.settings) {
      incomingSettings = JSON.parse(req.body.settings);
    }

    /* Whitelist */
    const allowedFields = [
      "avatar",
      "primary_color",
      "secondary_color",
      "launcher_text",
      "bubble_style",
      "font",
      "is_enabled",
      "position",
      "welcome_message",
      "welcome_delay",
      "input_placeholder",
      "show_welcome_on_mobile",
      "show_branding"
    ];

    const allowedPositions = [
      "bottom-right",
      "bottom-left",
      "middle-right",
      "middle-left",
      "top-right",
      "top-left"
    ];

    if (
      incomingSettings.position?.type &&
      !allowedPositions.includes(incomingSettings.position.type)
    ) {
      return res.status(400).json({
        message: "position.type no válido"
      });
    }

    /* Merge settings */
    Object.keys(incomingSettings).forEach(key => {
      if (!allowedFields.includes(key)) return;

      // Avatar por URL (solo catálogo)
      if (key === "avatar" && !req.file) {
        const isValidAvatar = avatars.some(
          a => a.url === incomingSettings.avatar
        );

        if (!isValidAvatar) return;

        settings.avatar = incomingSettings.avatar;
        return;
      }

      // Merge profundo
      if (
        typeof incomingSettings[key] === "object" &&
        !Array.isArray(incomingSettings[key])
      ) {
        settings[key] = {
          ...settings[key],
          ...incomingSettings[key]
        };
      } else {
        settings[key] = incomingSettings[key];
      }
    });

    await settings.save();

    res.json({
      message: "Configuración actualizada correctamente",
      settings
    });

  } catch (error) {
    console.error("UPDATE SETTINGS ERROR:", error);
    res.status(500).json({
      message: "Error al actualizar configuración"
    });
  }
};

/* ─────────────── AVATARES DISPONIBLES ─────────────── */
exports.getAvailableAvatars = (req, res) => {
  res.json(avatars);
};
