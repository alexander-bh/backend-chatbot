const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth.middleware");
const upload = require("../middlewares/uploadAvatar.middleware");
const settingsController = require("../controllers/chatbotSettings.controller");

// Subir avatar
router.post(
  "/chatbots/:id/avatar",
  auth,
  upload.single("avatar"),
  settingsController.uploadAvatar
);

// Obtener configuración de chatbot
router.get(
  "/chatbots/:id/settings",
  auth,
  settingsController.getSettings
);

//Cuardar configuración de chatbot
router.post(
  "/chatbots/:id/settings",
  auth,
  settingsController.saveAllSettings
);

router.put(
  "/chatbots/:id/settings",
  auth,
  upload.single("avatar"),
  settingsController.saveAllSettingsWithAvatar
);

module.exports = router;
