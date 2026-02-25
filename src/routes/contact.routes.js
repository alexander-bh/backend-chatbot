const router = require("express").Router();
const contactController = require("../controllers/contact.controller");
const metricsController = require("../controllers/metrics.controller");
const auth = require("../middlewares/auth.middleware");

// Crear contacto (desde chatbot)
router.post("/", contactController.createContact);

// Obtener contactos (privado dashboard)
router.get("/:chatbot_id", auth, contactController.getContactsByChatbot);
router.get("/metrics/:chatbot_id", auth, metricsController.getChatbotMetrics);
router.get("/funnel/:chatbot_id",auth,metricsController.getNodeFunnel);

module.exports = router;