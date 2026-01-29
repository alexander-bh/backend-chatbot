const express = require("express");
const router = express.Router();
const controller = require("../controllers/conversationsession.controller");
const auth = require("../middlewares/auth.middleware");

router.post("/start", auth, controller.startConversation);
router.post("/:id/next", auth, controller.nextStep);

module.exports = router;