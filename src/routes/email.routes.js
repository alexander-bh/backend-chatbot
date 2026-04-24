const express = require("express");
const router = express.Router();
const email = require("../controllers/email.controller");

// POST /api/email/test
router.post("/test", email.sendTestEmail);

module.exports = router;