const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const flowController = require("../controllers/flow.controller");

// Crear flujo
router.post(
  "/",
  auth,
  role("ADMIN", "CLIENT"),
  flowController.createFlow
);

// Listar flujos por chatbot
router.get(
  "/chatbot/:chatbotId",
  auth,
  role("ADMIN", "CLIENT"),
  flowController.getFlowsByChatbot
);

// Actualizar flujo
router.put(
  "/:id",
  auth,
  role("ADMIN", "CLIENT"),
  flowController.updateFlow
);

// Eliminar flujo
router.delete(
  "/:id",
  auth,
  role("ADMIN", "CLIENT"),
  flowController.deleteFlow
);

// Guardar cambios (botón verde)
router.post(
  "/:id/save",
  auth,
  role("ADMIN", "CLIENT"),
  flowController.saveFlow
);

// Publicar flujo
router.post(
  "/:id/publish",
  auth,
  role("ADMIN", "CLIENT"),
  flowController.publishFlow
);

module.exports = router;
