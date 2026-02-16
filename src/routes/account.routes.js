const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth.middleware");
const accountCtrl = require("../controllers/users/account.controller");

router.get("/my-account", auth, accountCtrl.getMyAccount);

module.exports = router;