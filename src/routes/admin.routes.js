const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const userController = require("../controllers/user.controller");

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

router.get(
  "/users",
  auth,
  role("ADMIN"),
  userController.getUsers
);

module.exports = router;
