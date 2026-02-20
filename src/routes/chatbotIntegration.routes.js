const router = require("express").Router();
const ctrl = require("../integration/chatbotIntegration.controller");
const auth = require("../middlewares/auth.middleware");

//RUTAS PARA LA INSTALCION DEL CHTABOT
router.get("/:public_id/install", ctrl.getInstallScript);
router.get("/widget/:public_id", ctrl.serveWidget);
//RUTAS PRIVADAS
router.use(auth);
router.get("/:public_id/installation", ctrl.InstallationCode);
router.post("/:public_id/domain/add", ctrl.addAllowedDomain);
router.delete("/:public_id/domain/remove", ctrl.removeAllowedDomain);
router.post("/:public_id/token/regenerate", ctrl.regenerateInstallToken);  

module.exports = router;
