const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth.middleware");
const settingsController = require("../controllers/chatbots.controller"); 

// Obtener avatares disponibles
router.get(
  "/:id/avatars",
  auth,
  settingsController.getAvailableAvatars
);

// Eliminar avatar 
router.delete(
  "/:id/deleteAvatar",
  auth,
  settingsController.deleteAvatar
);

module.exports = router;
