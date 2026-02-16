//public-chatbot.routes
const express = require("express");
const router = express.Router();
const controller = require("../../controllers/chatbots/publicChatbot.controller");
const publicRateLimit = require("../../middlewares/publicRateLimit"); 

router.post(
  "/chatbot-conversation/:public_id/start",
  publicRateLimit,
  controller.startConversation
);

router.post(
  "/chatbot-conversation/:session_id/next",
  controller.nextPublicStep
);

module.exports = router;
