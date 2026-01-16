const router = require("express").Router();
const controller = require("../controllers/chatbots.controller");


// ---> Crear chatbot
router.post("/", controller.create);

// ---> Obtener todos los chatbots de la cuenta
router.get("/", controller.findAll);

// ---> Obtener un chatbot
router.get("/:id", controller.findOne);

// ---> Actualizar chatbot
router.put("/:id", controller.update);

// ---> Eliminar chatbot
router.delete("/:id", controller.remove);

module.exports = router;