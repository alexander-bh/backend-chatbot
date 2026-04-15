const router = require("express").Router();
const contactController = require("../controllers/contact.controller");
const metricsController = require("../controllers/metrics.controller");
const webhook = require("../controllers/webhook.controller");
const auth = require("../middlewares/auth.middleware");

// ── Rutas públicas ────────────────────────────────────────────────────────────
router.post("/", contactController.createContact);
router.post("/webhooks/contacts-deleted", webhook.notifyContactsDeleted);

// ── Rutas con segmento fijo (deben ir ANTES de las rutas con :params) ─────────
router.get("/", auth, contactController.getContacts);
router.get("/search", auth, contactController.searchContacts);
router.get("/by-chatbot-name", auth, contactController.getContactsByChatbotName);
router.get("/domains", auth, contactController.getAllDomains);
router.get("/chatbots/names", auth, contactController.getChatbotNames);
router.post("/manual", auth, contactController.createManualContact);
router.delete("/contacts-delete", auth, contactController.deleteContacts);


// ── Métricas (segmento fijo "metrics" y "funnel" antes de /:id genérico) ──────
router.get("/metrics/:chatbot_id", auth, metricsController.getChatbotMetrics);
router.get("/funnel/:chatbot_id", auth, metricsController.getNodeFunnel);

// ── Rutas con parámetros dinámicos (van al final) ─────────────────────────────
router.get("/:chatbot_id", auth, contactController.getContactsByChatbot);
router.put("/:id", auth, contactController.updateContact);
router.patch("/:id/status", auth, contactController.updateStatus);
router.patch("/:id/limits", auth, contactController.updateLimits);

module.exports = router;