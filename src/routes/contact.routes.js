const router = require("express").Router();
const contactController = require("../controllers/contact.controller");
const metricsController = require("../controllers/metrics.controller");
const webhook = require("../controllers/webhook.controller");
const auth = require("../middlewares/auth.middleware");

// Crear contacto desde chatbot
router.post("/",contactController.createContact);

router.post("/webhooks/contacts-deleted", webhook.notifyContactsDeleted);

// Dashboard privado
router.post(
  "/manual",
  auth,
  contactController.createManualContact
);

router.get(
  "/",
  auth,
  contactController.getContacts
);

router.get(
  "/deleted",
  auth,
  contactController.getDeletedContacts
);

// métricas primero
router.get(
  "/metrics/:chatbot_id",
  auth,
  metricsController.getChatbotMetrics
);

router.get(
  "/funnel/:chatbot_id",
  auth,
  metricsController.getNodeFunnel
);

// rutas con id después
router.get(
  "/:chatbot_id",
  auth,
  contactController.getContactsByChatbot
);

router.put(
  "/:id",
  auth,
  contactController.updateContact
);

router.delete(
  "/:id",
  auth,
  contactController.deleteContact
);

router.patch(
  "/:id/status",
  auth,
  contactController.updateStatus
);

router.patch(
  "/:id/limits",
  auth,
  contactController.updateLimits
);

router.patch(
  "/restore/:id",
  auth,
  contactController.restoreContact
);

router.delete(
  "/force/:id",
  auth,
  contactController.permanentlyDeleteContact
);

module.exports = router;