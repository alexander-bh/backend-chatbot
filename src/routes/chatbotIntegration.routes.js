const router = require("express").Router();
const rateLimit = require("express-rate-limit");
const ctrl = require("../integration/chatbotIntegration.controller");
const auth = require("../middlewares/auth.middleware");

/* ────────────────────────────────────────────── */
/* RATE LIMIT SOLO PARA SCRIPT */
/* ────────────────────────────────────────────── */

const chatbotScriptLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 20,
  standardHeaders: false,
  legacyHeaders: false,
  handler: (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res
      .status(429)
      .type("application/javascript")
      .send(`console.warn("[Chatbot] Rate limit excedido");`);
  }
});
/* ────────────────────────────────────────────── */
/* PUBLIC ROUTES (NO AUTH) */
/* ────────────────────────────────────────────── */
// Script embebible
router.get("/chatbot/:public_id.js", chatbotScriptLimiter, ctrl.integrationScript
);
// Iframe embed
router.get("/embed/:public_id", ctrl.renderEmbed);

/* ────────────────────────────────────────────── */
/* PRIVATE ROUTES (DASHBOARD) */
/* ────────────────────────────────────────────── */

router.use(auth);
// Obtener script de instalación
router.get("/:public_id/install", ctrl.getInstallScript);
// Enviar código de instalación por email
router.post("/:public_id/send-installation", ctrl.sendInstallationCode);
// Dominios permitidos
router.post("/:public_id/domain/add", ctrl.addAllowedDomain);
router.post("/:public_id/domain/remove", ctrl.removeAllowedDomain);
// Token
router.post("/:public_id/token/regenerate", ctrl.regenerateInstallToken);


module.exports = router;
