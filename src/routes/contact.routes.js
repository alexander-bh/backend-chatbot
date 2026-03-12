const router = require("express").Router();
const contactController = require("../controllers/contact.controller");
const metricsController = require("../controllers/metrics.controller");
const auth = require("../middlewares/auth.middleware");

// middleware de debug
const debug = (routeName) => (req, res, next) => {
  console.log("----------- CONTACT ROUTE -----------");
  console.log("Route:", routeName);
  console.log("URL:", req.originalUrl);
  console.log("Method:", req.method);
  console.log("Params:", req.params);
  console.log("Query:", req.query);
  console.log("Body:", req.body);
  console.log("Authorization:", req.headers.authorization);
  console.log("-------------------------------------");
  next();
};

// Crear contacto desde chatbot
router.post(
  "/",
  debug("POST /contacts"),
  contactController.createContact
);

// Dashboard privado
router.post(
  "/manual",
  debug("POST /contacts/manual"),
  auth,
  contactController.createManualContact
);

router.get(
  "/",
  debug("GET /contacts"),
  auth,
  contactController.getContacts
);

router.get(
  "/deleted",
  debug("GET /contacts/deleted"),
  auth,
  contactController.getDeletedContacts
);

// métricas primero
router.get(
  "/metrics/:chatbot_id",
  debug("GET /contacts/metrics/:chatbot_id"),
  auth,
  metricsController.getChatbotMetrics
);

router.get(
  "/funnel/:chatbot_id",
  debug("GET /contacts/funnel/:chatbot_id"),
  auth,
  metricsController.getNodeFunnel
);

// rutas con id después
router.get(
  "/:chatbot_id",
  debug("GET /contacts/:chatbot_id"),
  auth,
  contactController.getContactsByChatbot
);

router.put(
  "/:id",
  debug("PUT /contacts/:id"),
  auth,
  contactController.updateContact
);

router.delete(
  "/:id",
  debug("DELETE /contacts/:id"),
  auth,
  contactController.deleteContact
);

router.patch(
  "/:id/status",
  debug("PATCH /contacts/:id/status"),
  auth,
  contactController.updateStatus
);

router.patch(
  "/restore/:id",
  debug("PATCH /contacts/restore/:id"),
  auth,
  contactController.restoreContact
);

router.delete(
  "/force/:id",
  debug("DELETE /contacts/force/:id"),
  auth,
  contactController.permanentlyDeleteContact
);

module.exports = router;