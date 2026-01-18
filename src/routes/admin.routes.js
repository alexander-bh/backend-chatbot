const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");

router.get(
  "/dashboard",
  auth,
  role("ADMIN"),
  (req, res) => {
    res.json({
      message: "Bienvenido ADMIN",
      user: req.user
    });
  }
);

module.exports = router;
