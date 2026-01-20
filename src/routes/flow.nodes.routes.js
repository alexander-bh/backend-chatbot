const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const nodeController = require("../controllers/flownodes.controller");

// Crear nodo
router.post("/",auth,role("ADMIN", "CLIENT"),nodeController.createNode);

// Obtener nodos por flow
router.get("/flow/:flowId",auth,nodeController.getNodesByFlow);

// Actualizar nodo (PATCH)
router.patch("/:id",auth,role("ADMIN", "CLIENT"),nodeController.updateNode);

// Eliminar nodo
router.delete("/:id",auth,role("ADMIN", "CLIENT"),nodeController.deleteNode);

// Conectar nodos
router.post("/:id/connect",auth,role("ADMIN", "CLIENT"),nodeController.connectNode);

// Actualizar canvas (posiciones)
router.post("/update-canvas",auth,role("ADMIN", "CLIENT"),nodeController.updateCanvas);

// Duplicar nodo
router.post("/:id/duplicate",auth,role("ADMIN", "CLIENT"),nodeController.duplicateNode);

module.exports = router;
