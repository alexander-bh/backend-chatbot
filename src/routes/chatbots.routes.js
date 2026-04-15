const express = require("express");
const router = express.Router();
const chatbotController = require("../controllers/chatbots.controller");
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const conditionalUpload = require("../middlewares/conditionalUpload.middleware");

//crear chatbot
router.post("/", auth, role("ADMIN", "CLIENT"), chatbotController.createChatbot);
//listar chatbots
router.get("/", auth, role("ADMIN", "CLIENT"), chatbotController.listChatbots);
//eliminar chatbot
router.delete("/:id", auth, role("ADMIN", "CLIENT"), chatbotController.deleteChatbot);
//duplicar chatbot con todo su contenido
router.post("/:id/duplicate-full", auth, role("ADMIN", "CLIENT"), chatbotController.duplicateChatbotFull);
// obtener chatbot por id
router.get("/:id", auth, role("ADMIN", "CLIENT"), chatbotController.getChatbotById);
//Actualizar chatbot 
router.put("/:id/settings", auth, conditionalUpload, chatbotController.updateChatbot);
// Obtener avatares disponibles
router.get("/:id/avatars", auth, chatbotController.getAvailableAvatars);
// Eliminar avatar 
router.delete("/:id/deleteAvatar", auth, chatbotController.deleteAvatar);
// Obtener configuración de email
router.get("/:chatbotId/notification-settings", auth, chatbotController.getNotificationSettings);
// Actualizar configuración de email
router.patch("/:chatbotId/email-settings", auth, chatbotController.updateEmailSettings);
// Actualizar configuración de teléfono
router.patch("/:chatbotId/phone-settings", auth, chatbotController.updatePhoneSettings);

module.exports = router;