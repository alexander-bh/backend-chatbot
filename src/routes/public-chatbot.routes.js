const express = require("express");
const router = express.Router();
const controller = require("../controllers/publicChatbot.controller");
const publicRateLimit = require("../middlewares/publicRateLimit"); 

router.post(
  "/chatbot/:public_id/start",
  publicRateLimit,
  controller.startConversation
);

module.exports = router;
