const router = require("express").Router();
const authCtrl = require("../controllers/auth.controller");
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const { resolveAccount } = require("../middlewares/resolveAccount");

// Crear la primera cuenta + admin
router.post("/register-first", authCtrl.registerFirst);

// Login por subdominio
router.post("/login", authCtrl.loginAutoAccount);

// Crear usuarios dentro de una cuenta (solo ADMIN)
router.post("/register", resolveAccount, auth, role("ADMIN"), authCtrl.register);

// Sesión
router.post("/logout", auth, authCtrl.logout);
router.post("/change-password", auth, authCtrl.changePassword);
router.put("/update-profile", auth, authCtrl.updateProfile);

module.exports = router;
