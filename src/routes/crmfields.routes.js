const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const CRMField = require("../models/CrmField");

router.get("/", auth, async (req, res) => {
  try {
    const fields = await CRMField
      .find({ is_active: true })
      .sort({ label: 1 });

    res.json(fields);
  } catch (error) {
    res.status(500).json({ message: "Error al obtener campos CRM" });
  }
});

router.post("/", auth, async (req, res) => {
  try {
    const { key, label } = req.body;

    if (!key || !label) {
      return res.status(400).json({ message: "key y label son obligatorios" });
    }

    const exists = await CRMField.findOne({ key });
    if (exists) {
      return res.status(409).json({ message: "El campo ya existe" });
    }

    const field = await CRMField.create({
      key,
      label,
      is_active: true
    });

    res.status(201).json(field);
  } catch (error) {
    res.status(500).json({ message: "Error al crear campo CRM" });
  }
});


module.exports = router;
