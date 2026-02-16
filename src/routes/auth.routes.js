const router = require("express").Router();
const authCtrl = require("../controllers/auth.controller");
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const { resolveAccount } = require("../middlewares/resolveAccount");
const rateLimit = require("express-rate-limit");

// Crear la primera cuenta 
router.post("/register-first", authCtrl.registerFirst);

// Login
router.post("/login", authCtrl.login);

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

const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5
});

// Recuperación de contraseña (SIN auth)
router.post("/forgot-password", forgotLimiter, authCtrl.forgotPassword);

// Resetear contraseña (SIN auth)
router.post("/reset-password", authCtrl.resetPassword);

module.exports = router;

