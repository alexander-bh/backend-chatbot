const express = require("express");
const router = express.Router();
const controller = require("../controllers/chatbotSettings.controller");
const auth = require("../middlewares/auth.middleware");

router.post("/start", auth, controller.startConversation);
router.post("/next", auth, controller.nextStep);

module.exports = router;