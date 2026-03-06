const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const flowController = require("../controllers/flows.controller");
const FLOW_ROLE = role("ADMIN", "CLIENT");

// Guardar cambios
router.post(
  "/:id/save",
  auth,
  FLOW_ROLE,
  flowController.saveFlow
);

// Obtener nodos por flow
router.get(
  "/:flowId",
  auth,
  flowController.getNodesByFlow
);


module.exports = router;
