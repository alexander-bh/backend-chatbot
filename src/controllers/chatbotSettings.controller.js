const ChatbotSettings = require("../models/ChatbotSettings");
const Chatbot = require("../models/Chatbot");
const avatars = require("../config/chatbotAvatars");

const MAX_AVATARS = 50;

// Subir avatar 
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
      settings = new ChatbotSettings({ chatbot_id: chatbot._id });
    }

    settings.uploaded_avatars ||= [];

    if (settings.uploaded_avatars.length >= MAX_AVATARS) {
      return res.status(400).json({
        message: `Límite de ${MAX_AVATARS} avatares alcanzado`
      });
    }

    const uploadedAvatar = {
      url: req.file.path,
      public_id: req.file.filename || req.file.public_id
    };

    const alreadyExists = settings.uploaded_avatars.some(
      avatar =>
        avatar.url === uploadedAvatar.url ||
        avatar.public_id === uploadedAvatar.public_id
    );

    if (alreadyExists) {
      return res.status(409).json({
        message: "Este avatar ya fue subido anteriormente"
      });
    }

    settings.uploaded_avatars.push(uploadedAvatar);
    settings.avatar = uploadedAvatar.url;

    await settings.save();

    res.json({
      message: "Avatar subido correctamente",
      avatar: settings.avatar,
      uploaded_avatars: settings.uploaded_avatars
    });

  } catch (error) {
    console.error("UPLOAD AVATAR ERROR:", error);
    res.status(500).json({ message: "Error al subir avatar" });
  }
};

// Obtener las configuraciones 
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

// Actualizar configuraciones 
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
      settings.uploaded_avatars ||= [];

      if (settings.uploaded_avatars.length >= MAX_AVATARS) {
        return res.status(400).json({
          message: `Límite de ${MAX_AVATARS} avatares alcanzado`
        });
      }

      const uploadedAvatar = {
        url: req.file.path,
        public_id: req.file.filename || req.file.public_id
      };

      const alreadyExists = settings.uploaded_avatars.some(
        a =>
          a.url === uploadedAvatar.url ||
          a.public_id === uploadedAvatar.public_id
      );

      if (!alreadyExists) {
        settings.uploaded_avatars.push(uploadedAvatar);
      }

      settings.avatar = uploadedAvatar.url;
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
        const isSystemAvatar = avatars.some(a => a.url === incomingSettings.avatar);
        const isUploadedAvatar = settings.uploaded_avatars.some(
          a => a.url === incomingSettings.avatar
        );

        if (!isSystemAvatar && !isUploadedAvatar) return;

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

// Eliminar avatar 
exports.deleteAvatar = async (req, res) => {
  try {
    const chatbot = await Chatbot.findOne({
      _id: req.params.id,
      account_id: req.user.account_id
    });

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    const { avatarUrl } = req.body;

    if (!avatarUrl) {
      return res.status(400).json({
        message: "avatarUrl requerido"
      });
    }

    const settings = await ChatbotSettings.findOne({
      chatbot_id: chatbot._id
    });

    if (!settings) {
      return res.status(404).json({ message: "Settings no encontrados" });
    }

    settings.uploaded_avatars ||= [];

    settings.uploaded_avatars = settings.uploaded_avatars.filter(
      a => a.url !== avatarUrl
    );

    if (
      settings.avatar === avatarUrl ||
      settings.uploaded_avatars.length === 0
    ) {
      settings.avatar = process.env.DEFAULT_CHATBOT_AVATAR;
    }

    await settings.save();

    res.json({
      message: "Avatar eliminado del chatbot",
      avatar: settings.avatar,
      uploaded_avatars: settings.uploaded_avatars
    });

  } catch (error) {
    console.error("DELETE AVATAR ERROR:", error);
    res.status(500).json({ message: "Error al eliminar avatar" });
  }
};

// Avatar disponibles 
exports.getAvailableAvatars = async (req, res) => {
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

    res.json({
      system: avatars,
      uploaded: settings?.uploaded_avatars || [],
      active: settings?.avatar
    });
  } catch (error) {
    console.error("GET AVAILABLE AVATARS ERROR:", error);
    res.status(500).json({ message: "Error al obtener avatares" });
  }
};


