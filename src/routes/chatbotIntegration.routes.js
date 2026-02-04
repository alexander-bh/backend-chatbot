const router = require("express").Router();
const rateLimit = require("express-rate-limit");
const ctrl = require("../integration/chatbotIntegration.controller");
const auth = require("../middlewares/auth.middleware");

const chatbotScriptLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  handler: (req, res) => {
    res.setHeader(
      "Access-Control-Allow-Origin",
      req.headers.origin || "*"
    );
    res.status(429).send(`console.warn("Rate limit excedido");`);
  },
  standardHeaders: false,
  legacyHeaders: false
});

// public
router.get("/chatbot/:public_id.js", chatbotScriptLimiter, ctrl.integrationScript);
router.get("/embed/:public_id", ctrl.renderEmbed);


// private
router.use(auth);
router.post("/:id/send-installation", ctrl.sendInstallationCode);
router.get("/:id/install", ctrl.getInstallScript);
router.post("/:id/domain/add", ctrl.addAllowedDomain);
router.post("/:id/domain/remove", ctrl.removeAllowedDomain);
router.post("/:id/token/regenerate", ctrl.regenerateInstallToken)



module.exports = router;
