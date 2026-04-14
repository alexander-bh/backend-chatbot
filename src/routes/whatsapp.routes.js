const express = require("express");
const router = express.Router();
const whatsappController = require("../controllers/whatsapp.controller");

// Meta verifica este endpoint con GET
router.get("/webhook", whatsappController.verifyWebhook);

// Meta envía eventos de mensajes con POST
router.post("/webhook", whatsappController.receiveMessage);

module.exports = router;