// routes/analytics.routes.js
const express = require("express");
const router = express.Router();
const analyticsController = require("../controllers/analytics.controller");
const authMiddleware = require("../middlewares/auth.middleware");

router.get(
  "/flow/:id/dropoff",
  authMiddleware,
  analyticsController.getFlowDropOff
);

module.exports = router;