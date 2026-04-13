// routes/public-chatbot.routes.js
const express = require("express");
const router = express.Router();
const controller = require("../controllers/publicChatbot.controller");
const { publicLimiter } = require("../middlewares/publicRateLimit");

// ── Nuevo flujo bundle ──
router.get(
  "/chatbot-conversation/:public_id/bundle",
  publicLimiter,
  controller.getFlowBundle
);

router.post(
  "/chatbot-conversation/:public_id/finish",
  publicLimiter,
  controller.finishConversation
);

router.post(
  "/chatbot-conversation/:public_id/validate-field",
  publicLimiter,
  controller.validateField
);

module.exports = router;