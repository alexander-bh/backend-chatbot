const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const nodeTypeController = require("../controllers/nodeType.controller");
router.use(auth);
/* =========================
   NODE TYPE ROUTES
========================= */

// Crear
router.post("/", role("ADMIN"), nodeTypeController.createNodeType);

// Editar
router.put("/:id", role("ADMIN"), nodeTypeController.updateNodeType);

// Listar
router.get("/", nodeTypeController.getNodeTypes);

// Eliminar
router.delete("/:id", role("ADMIN"), nodeTypeController.deleteNodeType);

module.exports = router;