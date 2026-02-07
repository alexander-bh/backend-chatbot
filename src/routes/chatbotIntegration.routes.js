const router = require("express").Router();
const rateLimit = require("express-rate-limit");
const ctrl = require("../integration/chatbotIntegration.controller");
const auth = require("../middlewares/auth.middleware");

/* ────────────────────────────────────────────── */
/* RATE LIMIT SOLO PARA SCRIPTS PÚBLICOS         */
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
/* RUTAS PÚBLICAS (NO AUTH)                      */
/* ────────────────────────────────────────────── */

// 1) SCRIPT DE INTEGRACIÓN (crea el iframe final)
router.get(
  "/integration/:public_id",
  chatbotScriptLimiter,
  ctrl.integrationScript
);

// 2) IFRAME EMBED (HTML del chatbot)
router.get("/embed/:public_id", ctrl.renderEmbed);

/* ────────────────────────────────────────────── */
/* RUTAS PRIVADAS (DASHBOARD)                    */
/* ────────────────────────────────────────────── */

router.use(auth);

// 3) INSTALACIÓN REAL  →  /:public_id/install
router.get("/:public_id/install", ctrl.getInstallScript);

// 4) GENERAR CÓDIGO DE INSTALACIÓN
router.post("/:public_id/send-installation", ctrl.sendInstallationCode);

// 5) DOMINIOS PERMITIDOS
router.post("/:public_id/domain/add", ctrl.addAllowedDomain);
router.post("/:public_id/domain/remove", ctrl.removeAllowedDomain);

// 6) REGENERAR TOKEN (si lo usas)
router.post("/:public_id/token/regenerate", ctrl.regenerateInstallToken);


module.exports = router;
