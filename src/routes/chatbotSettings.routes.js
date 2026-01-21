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
router.get("/chatbots/avatars", auth, settingsController.getAvailableAvatars);



module.exports = router;
