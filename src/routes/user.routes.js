const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth.middleware");
const userCtrl = require("../controllers/user.controller");

router.get("/profile", auth, userCtrl.getProfile);
router.get("/all", auth, userCtrl.getUsers);
router.get("/:id", auth, userCtrl.getUserById);

module.exports = router;
