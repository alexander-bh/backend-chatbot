const ChatbotSettings = require("../models/ChatbotSettings");
const Chatbot = require("../models/Chatbot");
const cloudinary = require("cloudinary").v2;

// Subir avatar del chatbot
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
// Obtener settings del chatbot
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
// Actualizar settings del chatbot
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
// Guardar toda la configuración del chatbot
exports.saveAllSettings = async (req, res) => {
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

    // Si no existen settings → los crea
    if (!settings) {
      settings = new ChatbotSettings({
        chatbot_id: chatbot._id
      });
    }

    Object.keys(req.body).forEach(key => {
      if (
        typeof req.body[key] === "object" &&
        !Array.isArray(req.body[key]) &&
        settings[key]
      ) {
        // merge profundo (ej: position)
        settings[key] = {
          ...settings[key],
          ...req.body[key]
        };
      } else {
        settings[key] = req.body[key];
      }
    });

    await settings.save();

    res.json({
      message: "Configuración actualizada correctamente",
      settings
    });
  } catch (error) {
    console.error("SAVE SETTINGS ERROR:", error);
    res.status(500).json({ message: "Error al guardar configuración" });
  }
};
// Guardar toda la configuración del chatbot
exports.saveAllSettingsWithAvatar = async (req, res) => {
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
      settings = new ChatbotSettings({
        chatbot_id: chatbot._id
      });
    }

    // Avatar (si viene archivo)
    if (req.file) {
      if (
        settings.avatar &&
        !settings.avatar.includes("Captura_de_pantalla_2025")
      ) {
        const publicId = settings.avatar.split("/").pop().split(".")[0];
        await cloudinary.uploader.destroy(publicId);
      }

      settings.avatar = req.file.path;
    }

    if (req.body.settings) {
      const parsedSettings = JSON.parse(req.body.settings);

      Object.keys(parsedSettings).forEach(key => {
        if (
          typeof parsedSettings[key] === "object" &&
          !Array.isArray(parsedSettings[key]) &&
          settings[key]
        ) {
          settings[key] = {
            ...settings[key],
            ...parsedSettings[key]
          };
        } else {
          settings[key] = parsedSettings[key];
        }
      });
    }

    await settings.save();

    res.json({
      message: "Configuración completa guardada",
      settings
    });
  } catch (error) {
    console.error("SAVE ALL SETTINGS ERROR:", error);
    res.status(500).json({ message: "Error al guardar configuración" });
  }
};
