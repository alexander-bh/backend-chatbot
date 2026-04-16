const router = require("express").Router();
const ctrl = require("../integration/chatbotIntegration.controller");
const auth = require("../middlewares/auth.middleware");

// FIX Bug 1: destructurar correctamente
const { challengeLimiter } = require("../middlewares/publicRateLimit");

/* ================================
   🌍 RUTAS PÚBLICAS (INSTALACIÓN)
================================ */
router.get("/embed/:public_id", ctrl.renderEmbed);
router.get("/:public_id/install", ctrl.getInstallScript);
router.post("/config/verify", ctrl.verifyConfigSignature);
router.get("/:public_id/challenge", challengeLimiter, ctrl.getChallenge);
router.post("/translate", ctrl.translateBundle);

/* ================================
   🔒 RUTAS PRIVADAS (ADMIN BOT)
================================ */
router.use(auth);
router.get("/:public_id/installation", ctrl.InstallationCode);
router.post("/:public_id/domain/add", ctrl.addAllowedDomain);
router.delete("/:public_id/domain/remove", ctrl.removeAllowedDomain);

module.exports = router;