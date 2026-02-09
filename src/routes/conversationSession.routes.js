//conversationSession.routes
const express = require("express");
const router = express.Router();
const controller = require("../controllers/conversationsession.controller");
const preview = require("../controllers/previewConversation.controller")
const auth = require("../middlewares/auth.middleware");

router.post("/preview/start", preview.startPreview);
router.post("/preview/:session_id/next", preview.nextPreviewStep);

router.post("/start", auth, controller.startConversation);
router.post("/:id/next", auth, controller.nextStep);

module.exports = router;