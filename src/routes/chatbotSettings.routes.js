const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth.middleware");
const settingsController = require("../controllers/chatbots.controller"); 
const upload = require("../middlewares/uploadAvatar.middleware");

//Actualizar chatbot 
router.put(
  "/:id/settings",
  auth,
  upload.single("avatar"),
  settingsController.updateChatbot
);

// Obtener avatares disponibles
router.get(
  "/chatbots/:id/avatars",
  auth,
  settingsController.getAvailableAvatars
);

// Eliminar avatar 
router.delete(
  "/chatbots/:id/deleteAvatar",
  auth,
  settingsController.deleteAvatar
);

module.exports = router;
