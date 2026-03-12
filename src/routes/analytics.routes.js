// routes/analytics.routes.js
const express = require("express");
const router = express.Router();
const analyticsController = require("../controllers/analytics.controller");
const authMiddleware = require("../middlewares/auth.middleware");

// Middleware de debug
const debugRequest = (req, res, next) => {
  console.log("---- ANALYTICS REQUEST ----");
  console.log("URL:", req.originalUrl);
  console.log("Method:", req.method);
  console.log("Params:", req.params);
  console.log("Query:", req.query);
  console.log("Authorization Header:", req.headers.authorization);
  console.log("---------------------------");
  next();
};

router.get(
  "/flow/:id/dropoff",
  debugRequest,
  authMiddleware,
  analyticsController.getFlowDropOff
);

router.get(
  "/chatbot/:id/contacts-by-date",
  debugRequest,
  authMiddleware,
  analyticsController.getContactsByDate
);

router.get(
  "/chatbot/:id/contacts-by-hour",
  debugRequest,
  authMiddleware,
  analyticsController.getContactsByHour
);

router.get(
  "/chatbot/:id/overview",
  debugRequest,
  authMiddleware,
  analyticsController.getChatbotOverview
);

router.get(
  "/chatbot/:id/getContactsByOrigin",
  debugRequest,
  authMiddleware,
  analyticsController.getContactsByOrigin
);

router.get(
  "/chatbot/:id/getContactsDetail",
  debugRequest,
  authMiddleware,
  analyticsController.getContactsDetail
);

module.exports = router;