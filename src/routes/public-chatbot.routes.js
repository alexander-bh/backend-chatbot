// public-chatbot.routes
const express = require("express");
const router = express.Router();
const controller = require("../controllers/publicChatbot.controller");

const { publicLimiter } = require("../middlewares/publicRateLimit");

router.post(
  "/chatbot-conversation/:public_id/start",
  publicLimiter,
  controller.startConversation
);

router.post(
  "/chatbot-conversation/:session_id/next",
  controller.nextPublicStep
);

module.exports = router;