const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const controller = require("../controllers/flow-nodes.controller");

router.use(auth);

//---> Crear nodo
router.post("/:flowId", controller.create);

//---> Listar nodos de un flujo
router.get("/:flowId", controller.findAll);

//---> Obtener nodo
router.get("/single/:id", controller.findOne);

//---> Actualizar nodo
router.put("/:id", controller.update);

//---> Eliminar nodo
router.delete("/:id", controller.remove);

module.exports = router;
