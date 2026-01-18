const express = require("express");
const router = express.Router();
const chatbotController = require("../controllers/chatbots.controller");
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");


//crear chatbot
router.post("/", auth, role("ADMIN", "CLIENT"), chatbotController.createChatbot);
//listar chatbots
router.get("/", auth, role("ADMIN", "CLIENT"), chatbotController.listChatbots);
//actualizar chatbot
router.put("/:id", auth, role("ADMIN","CLIENT"), chatbotController.updateChatbot);
//eliminar chatbot
router.delete("/:id", auth, role("ADMIN", "CLIENT"), chatbotController.deleteChatbot);

module.exports = router;
