const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");

const flowController = require("../controllers/flows.controller");
const flowEdit = require("../controllers/flowEditor.controller");

const FLOW_ROLE = role("ADMIN", "CLIENT");

// Crear flujo
router.post(
  "/",
  auth,
  FLOW_ROLE,
  flowController.createFlow
);

// Listar flujos por chatbot
router.get(
  "/chatbot/:chatbotId",
  auth,
  FLOW_ROLE,
  flowController.getFlowsByChatbot
);

// Actualizar flujo
router.put(
  "/:id",
  auth,
  FLOW_ROLE,
  flowController.updateFlow
);

// Editor
router.get(
  "/:flowId/editor",
  auth,
  FLOW_ROLE,
  flowEdit.getFlowEditorData
);


// Eliminar flujo
router.delete(
  "/:id",
  auth,
  FLOW_ROLE,
  flowController.deleteFlow
);


// Guardar cambios (botón verde)
router.post(
  "/:id/save",
  auth,
  FLOW_ROLE,
  flowController.saveFlow
);

// Obtener flujo por ID
router.get(
  "/:id",
  auth,
  FLOW_ROLE,
  flowController.getFlowById
);

//Cerrar Editor
router.post(
  "/:id/unlock",
  auth,
  flowController.unlockFlow
);

module.exports = router;
