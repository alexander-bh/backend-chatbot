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

router.get(
  "/chatbot/:id/contacts-by-date",
  authMiddleware,
  analyticsController.getContactsByDate
);

router.get(
  "/chatbot/:id/contacts-by-hour",
  authMiddleware,
  analyticsController.getContactsByHour
);

router.get(
  "/chatbot/:id/overview",
  authMiddleware,
  analyticsController.getChatbotOverview
);

module.exports = router;