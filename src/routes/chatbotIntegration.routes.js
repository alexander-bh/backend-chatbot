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

/* ───────── RUTAS PÚBLICAS ───────── */
router.get(
  "/integration/:public_id",
  chatbotScriptLimiter,
  ctrl.integrationScript
);
router.get("/embed/:public_id", ctrl.renderEmbed);
// INSTALL DEBE SER PÚBLICO
router.get("/:public_id/install", ctrl.getInstallScript);
/* ───────── RUTAS PRIVADAS ───────── */
router.use(auth);

router.post("/:public_id/send-installation", ctrl.sendInstallationCode);
router.post("/:public_id/domain/add", ctrl.addAllowedDomain);
router.post("/:public_id/domain/remove", ctrl.removeAllowedDomain);
router.post("/:public_id/token/regenerate", ctrl.regenerateInstallToken);



module.exports = router;
