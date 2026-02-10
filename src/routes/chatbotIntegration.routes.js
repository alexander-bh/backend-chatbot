const router = require("express").Router();
const ctrl = require("../integration/chatbotIntegration.controller");
const auth = require("../middlewares/auth.middleware");

router.get("/embed/:public_id", ctrl.renderEmbed);
// INSTALL DEBE SER PÚBLICO
router.get("/:public_id/install", ctrl.getInstallScript);
//RUTAS PRIVADAS
router.use(auth);
router.post("/:public_id/send-installation", ctrl.sendInstallationCode);
router.post("/:public_id/domain/add", ctrl.addAllowedDomain);
router.delete("/:public_id/domain/remove", ctrl.removeAllowedDomain);
router.post("/:public_id/token/regenerate", ctrl.regenerateInstallToken); //<--- revicion 

module.exports = router;
