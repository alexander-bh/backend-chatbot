const router = require("express").Router();
const authCtrl = require("../controllers/auth.controller");
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const { resolveAccount } = require("../middlewares/resolveAccount");

// Crear la primera cuenta + admin
router.post("/register-first", authCtrl.registerFirst);

// Login
router.post("/login", authCtrl.loginAutoAccount);

// Crear usuarios dentro de una cuenta (solo ADMIN)
router.post(
  "/register",
  resolveAccount,
  auth,
  role("ADMIN"),
  authCtrl.register
);

// Sesión
router.post("/logout", auth, authCtrl.logout);
router.post("/change-password", auth, authCtrl.changePassword);

// Recuperación de contraseña (SIN auth)
router.post("/forgot-password", authCtrl.forgotPassword);

// Validar token de reset (SIN auth)
router.get("/reset-password/:token", authCtrl.validateResetToken);

// Resetear contraseña (SIN auth)
router.post("/reset-password", authCtrl.resetPassword);

module.exports = router;
