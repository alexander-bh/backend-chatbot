const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const adminController = require("../controllers/admin.controller");
const upload = require("../middlewares/uploadAvatar.middleware");

router.use(auth);

/* =========================
   GLOBAL FLOW
========================= */

// Puede verlo cualquier usuario autenticado
router.get("/flow", adminController.getFlowDetail);


/* =========================
   DASHBOARD
========================= */

router.get("/dashboard", role("ADMIN"), adminController.getDashboard);


/* =========================
   USERS (ADMIN)
========================= */

router.get("/users", role("ADMIN"), adminController.getAllUsers);
router.get("/users/:id", role("ADMIN"), adminController.getUserDetail);
router.put("/users/:id", role("ADMIN"), adminController.updateAnyUser);
router.delete("/users/:id", role("ADMIN"), adminController.deleteAnyUser);


/* =========================
   ACCOUNTS (ADMIN)
========================= */

router.get("/accounts", role("ADMIN"), adminController.getAllAccounts);


/* =========================
   CHATBOTS
========================= */

// Crear chatbot → solo ADMIN
router.post("/chatbots", role("ADMIN"), adminController.createChatbotForUser);

// Listar chatbots → solo ADMIN
router.get("/chatbots", role("ADMIN"), adminController.getAllChatbots);

// Detalle → solo ADMIN
router.get("/chatbots/:id", role("ADMIN"), adminController.getChatbotDetail);

// Eliminar → solo ADMIN
router.delete("/chatbots/:id", role("ADMIN"), adminController.deleteAnyChatbot);

// Editar → solo ADMIN
router.put("/chatbots/:id", role("ADMIN"), upload.single("avatar"),adminController.updateAnyChatbot);


/* =========================
   AVATARS ADMIN
========================= */

router.get("/chatbots/:id/avatars", role("ADMIN"), adminController.getAvailableAvatars);
router.delete("/chatbots/:id/deleteAvatar", role("ADMIN"), adminController.deleteAvatar);
router.patch("/chatbots/:id/toggle", role("ADMIN"), adminController.toggleChatbot);
router.post("/:publicId/token/regenerate", role("ADMIN"), adminController.regenerateInstallToken);

/* =========================
   AUDITORÍAS
========================= */

router.get("/audit", role("ADMIN"), adminController.getAuditLogs);
router.post("/register", role("ADMIN"), adminController.createUserByAdmin);

/* =========================
   AVATARES GLOBALES
========================= */

router.post("/avatars", role("ADMIN"), upload.single("avatar"), adminController.createAvatar);
router.get("/avatars", role("ADMIN"), adminController.getAllAvatars);
router.delete("/avatars/:id", role("ADMIN"), adminController.deleteAvatarGlobal);
router.patch("/avatars/:id/set-default", role("ADMIN"), adminController.setDefaultAvatar);


/* =========================
   CONTACTO GLOBAL
========================= */

router.post("/templates", role("ADMIN"), adminController.createDefaultContactTemplate);
router.get("/templates", role("ADMIN"), adminController.getDefaultContactTemplates);
router.put("/templates/:id", role("ADMIN"), adminController.updateDefaultContactTemplate);
router.delete("/templates/:id", role("ADMIN"), adminController.deleteDefaultContactTemplate);
router.get("/templates/deleted", role("ADMIN"), adminController.getDeletedDefaultContactTemplates);
router.patch("/templates/:id/restore", role("ADMIN"), adminController.restoreDefaultContactTemplate);
router.delete("/templates/:id/permanent", role("ADMIN"), adminController.permanentlyDeleteDefaultContactTemplate);

module.exports = router;