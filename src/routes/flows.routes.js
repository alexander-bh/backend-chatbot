const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const controller = require("../controllers/flows.controller");

router.use(auth);

// ---> Crear flujo
router.post("/:chatbotId", controller.create);

// ---> Listar flujos de un chatbot
router.get("/:chatbotId", controller.findAll);

// ---> Obtener un flujo
router.get("/single/:id", controller.findOne);

// ---> Actualizar flujo
router.put("/:id", controller.update);

// ---> Eliminar flujo
router.delete("/:id", controller.remove);

module.exports = router;
