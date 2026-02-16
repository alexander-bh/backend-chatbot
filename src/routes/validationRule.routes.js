const express = require("express");
const router = express.Router();
const controller = require("../controllers/validationRule.controller");

// Obtener todas
router.get("/", controller.getAll);

// Obtener por categoría
router.get("/category/:category", controller.getByCategory);

// Crear
router.post("/", controller.create);

// Eliminar
router.delete("/:id", controller.remove);

module.exports = router;
