const router = require("express").Router();
const contactController = require("../controllers/contact.controller");
const metricsController = require("../controllers/metrics.controller");
const webhook = require("../controllers/webhook.controller");
const auth = require("../middlewares/auth.middleware");

// Rutas publicas
router.post("/", contactController.createContact);
router.post("/webhooks/contacts-deleted", webhook.notifyContactsDeleted);

// Dashboard privado

router.get("/", auth, contactController.getContacts);
router.post("/manual", auth, contactController.createManualContact);
router.put("/:id", auth, contactController.updateContact);
router.delete("/:id", auth, contactController.deleteContact);
router.patch("/:id/status", auth, contactController.updateStatus);
router.patch("/:id/limits", auth, contactController.updateLimits);
router.get("/:chatbot_id", auth, contactController.getContactsByChatbot);
//Analisis 
router.get("/metrics/:chatbot_id", auth, metricsController.getChatbotMetrics);
router.get("/funnel/:chatbot_id", auth, metricsController.getNodeFunnel);


module.exports = router;