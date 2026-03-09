const router = require("express").Router();
const authCtrl = require("../controllers/auth.controller");
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const forgotLimiter = require("../middlewares/publicRateLimit");

// Recuperación de contraseña (SIN auth)
router.post("/forgot-password", forgotLimiter, authCtrl.forgotPassword);
// Resetear contraseña (SIN auth)
router.post("/reset-password", authCtrl.resetPassword);
// Login
router.post("/login", authCtrl.login);
// Crear la primera cuenta 
router.post("/register-first", role("ADMIN", "CLIENT"), authCtrl.registerFirst);
// Sesión
router.post("/logout", auth,role("ADMIN", "CLIENT") ,authCtrl.logout);
router.post("/change-password", auth, role("ADMIN", "CLIENT"), authCtrl.changePassword);

module.exports = router;

