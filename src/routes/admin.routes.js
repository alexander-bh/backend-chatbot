const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const adminController = require("../controllers/admin.controller");
const upload = require("../middlewares/uploadAvatar.middleware");

router.get("/flows/:id", adminController.getFlowDetail);

router.use(auth);
router.use(role("ADMIN"));

router.get("/dashboard", adminController.getDashboard);

// users
router.get("/users", adminController.getAllUsers);
router.get("/users/:id", adminController.getUserDetail);
router.put("/users/:id", adminController.updateAnyUser);
router.delete("/users/:id", adminController.deleteAnyUser);

// accounts
router.get("/accounts", adminController.getAllAccounts);

// chatbots
router.post("/chatbots", adminController.createChatbotForUser);

router.get("/chatbots", adminController.getAllChatbots);

router.get("/chatbots/:id", adminController.getChatbotDetail);

router.delete("/chatbots/:id", adminController.deleteAnyChatbot);

router.put(
    "/chatbots/:id",
    upload.single("avatar"),
    adminController.updateAnyChatbot
);

/* ---------- AVATARS ADMIN ---------- */

router.get("/chatbots/:id/avatars",adminController.getAvailableAvatars);

router.delete("/chatbots/:id/deleteAvatar",adminController.deleteAvatar);

router.patch("/chatbots/:id/toggle",adminController.toggleChatbot);

router.post(
"/:publicId/token/regenerate",
  adminController.regenerateInstallToken
);


// flows
router.get("/chatbots/:chatbotId/flows", adminController.getFlowsByChatbot);

// soporte
router.post("/impersonate/:id", adminController.impersonateUser);

// auditorías
router.get("/audit", adminController.getAuditLogs);

// auditorías
router.post("/register", adminController.createUserByAdmin);

/* ---------- DIALOGO GLOBALE (ADMIN) ---------- */

router.post("/newflows", adminController.createOrReplaceGlobalFlow);
router.get("/global-flow",adminController.getGlobalFlow);

/* ---------- AVATARES GLOBALES (ADMIN) ---------- */

router.post("/avatars",upload.single("avatar"),adminController.createAvatar);
router.get("/avatars",adminController.getAllAvatars);
router.delete("/avatars/:id",adminController.deleteAvatarGlobal);
router.patch("/avatars/:id/set-default",adminController.setDefaultAvatar);

/* ---------- Contacto GLOBALES (ADMIN) ---------- */
router.post("/templates",adminController.createDefaultContactTemplate);
router.get("/templates",  adminController.getDefaultContactTemplates);
router.put("/templates/:id" , adminController.updateDefaultContactTemplate);
router.delete("/templates/:id", adminController.deleteDefaultContactTemplate);
router.get("/templates/deleted", adminController.getDeletedDefaultContactTemplates);
router.patch("/templates/:id/restore", adminController.restoreDefaultContactTemplate);
router.delete("/templates/:id/permanent", adminController.permanentlyDeleteDefaultContactTemplate);

module.exports = router;
