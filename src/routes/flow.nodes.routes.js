const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const nodeController = require("../controllers/flownodes.controller");

// Obtener nodos por flow
router.get(
  "/flow/:flowId",
  auth,
  role("ADMIN", "CLIENT"),
  nodeController.getNodesByFlow
);

/* =========================
   CRUD DE NODOS
========================= */

// Crear nodo
router.post(
  "/",
  auth,
  role("ADMIN", "CLIENT"),
  nodeController.createNode
);

// Actualizar nodo
router.patch(
  "/:id",
  auth,
  role("ADMIN", "CLIENT"),
  nodeController.updateNode
);

// Eliminar nodo
router.delete(
  "/:id",
  auth,
  role("ADMIN", "CLIENT"),
  nodeController.deleteNode
);

/* =========================
   OPERACIONES AVANZADAS
========================= */

// Conectar nodos
router.post(
  "/:id/connect",
  auth,
  role("ADMIN", "CLIENT"),
  nodeController.connectNode
);

// Insertar nodo después
router.post(
  "/:id/insert-after",
  auth,
  role("ADMIN", "CLIENT"),
  nodeController.insertAfterNode
);

// Duplicar nodo
router.post(
  "/:id/duplicate",
  auth,
  role("ADMIN", "CLIENT"),
  nodeController.duplicateNode
);

// Reordenar nodos
router.patch(
  "/reorder",
  auth,
  role("ADMIN", "CLIENT"),
  nodeController.reorderNodes
);

// Reordenar subárbol
router.patch(
  "/reorder-subtree",
  auth,
  role("ADMIN", "CLIENT"),
  nodeController.reorderSubtree
);


module.exports = router;
