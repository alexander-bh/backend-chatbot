const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const flowController = require("../controllers/flows.controller");
const uploadMedia = require("../middlewares/uploadMedia");

router.use(auth);
router.use(role("ADMIN", "CLIENT"));

// Guardar cambios
router.post(
  "/:id/save",
  uploadMedia.any(),
  flowController.saveFlow
);

// Obtener nodos por flows
router.get(
  "/:flowId",
  uploadMedia.any(),
  flowController.getNodesByFlow
);

module.exports = router;