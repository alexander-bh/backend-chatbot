//conversationSession.routes
const express = require("express");
const router = express.Router();
const controller = require("../controllers/conversationsession.controller");
const auth = require("../middlewares/auth.middleware");

router.use(auth);
router.post("/start", controller.startConversation);
router.post("/:id/next",  controller.nextStep);

module.exports = router;