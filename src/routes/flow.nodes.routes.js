const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const nodeController = require("../controllers/flownodes.controller");

// Crear nodo de flujo
router.post("/", auth, role("ADMIN","CLIENT"), nodeController.createNode);
// Obtener nodos por flujo
router.get("/flow/:flowId", auth, nodeController.getNodesByFlow);
// Actualizar nodo de flujo
router.put("/:id", auth, role("ADMIN", "CLIENT"), nodeController.updateNode);
// Eliminar nodo de flujo
router.delete("/:id", auth, role("ADMIN", "CLIENT"), nodeController.deleteNode);
// conectar nodos
router.post("/:id/connect", auth, role("ADMIN", "CLIENT"), nodeController.connectNode);


module.exports = router;
