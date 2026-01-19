const express = require("express");
const router = express.Router();
const controller = require("../controllers/conversationsession.controller");

const auth = require("../middlewares/auth.middleware");

// Iniciar conversación
router.post(
  "/start",
  auth,
  controller.startConversation
);

// Siguiente paso
router.post(
  "/next",
  auth,
  controller.nextStep
);

module.exports = router;
