const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const nodeTypeController = require("../controllers/nodeType.controller");

router.use(auth);
router.use(role("ADMIN"));

/* =========================
   NODE TYPE ROUTES
========================= */

// Crear
router.post("/", nodeTypeController.createNodeType);

// Editar
router.put("/:id" , nodeTypeController.updateNodeType);

// Listar
router.get("/", nodeTypeController.getNodeTypes);

// Eliminar
router.delete("/:id", nodeTypeController.deleteNodeType);

module.exports = router;