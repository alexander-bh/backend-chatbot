const router = require("express").Router();
const { USO_HERRAMIENTA, OBJETIVO } = require("../shared/enum/onboarding.enums");

router.get("/enums/onboarding", (req, res) => {
  res.json({
    uso_herramienta: USO_HERRAMIENTA,
    objetivo: OBJETIVO
  });
});

module.exports = router;