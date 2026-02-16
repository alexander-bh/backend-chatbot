const ValidationRule = require("../models/ValidationRule");

/* =========================================
   Obtener todas las reglas
========================================= */
exports.getAll = async (req, res) => {
    try {
        const rules = await ValidationRule.find();
        res.json(rules);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/* =========================================
   Obtener por categoría
========================================= */
exports.getByCategory = async (req, res) => {
    try {
        const rules = await ValidationRule.find({
            category: req.params.category
        });

        res.json(rules);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/* =========================================
   Crear nueva regla
========================================= */
exports.create = async (req, res) => {
    try {
        const rule = new ValidationRule(req.body);
        await rule.save();
        res.status(201).json(rule);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

/* =========================================
   Eliminar regla
========================================= */
exports.remove = async (req, res) => {
    try {
        await ValidationRule.findByIdAndDelete(req.params.id);
        res.json({ message: "Regla eliminada" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
