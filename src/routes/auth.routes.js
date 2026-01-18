const router = require("express").Router();
const authCtrl = require("../controllers/auth.controller");
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");

router.post(
  "/register",
  auth,
  role("ADMIN"),
  authCtrl.register
);

router.post("/register-first", authCtrl.registerFirst);
router.post("/login", authCtrl.login);
router.post("/logout", auth, authCtrl.logout);


module.exports = router;