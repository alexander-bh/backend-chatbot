const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth.middleware");
const upload = require("../middlewares/uploadAvatar.middleware");
const settingsController = require("../controllers/chatbotSettings.controller");

// Obtener configuración de chatbot
router.get(
  "/chatbots/:id/settings",
  auth,
  settingsController.getSettings
);
// Actualizar configuración de chatbot
router.put(
  "/chatbots/:id/settings",
  auth,
  upload.single("avatar"),
  settingsController.updateChatbotSettings
);
// Obtener avatares disponibles
router.get(
  "/chatbots/:id/avatars",
  auth,
  settingsController.getAvailableAvatars
);

// Eliminar avatar 
router.delete(
  "/chatbots/:id/avatar",
  auth,
  settingsController.deleteAvatar
);

module.exports = router;
