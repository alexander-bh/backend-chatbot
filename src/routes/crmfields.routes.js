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

module.exports = router;
