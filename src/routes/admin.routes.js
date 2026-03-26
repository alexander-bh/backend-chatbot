const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const upload = require("../middlewares/uploadAvatar.middleware");

const adminController = require("../controllers/admin.controller");

// 🔐 Todas las rutas requieren auth
router.use(auth);

/* =====================================================
   🌐 GLOBAL FLOW (cualquier usuario autenticado)
===================================================== */
router.get("/flow", adminController.getFlowDetail);

/* =====================================================
   📊 DASHBOARD
===================================================== */
router.get("/dashboard", role("ADMIN"), adminController.getDashboard);

/* =====================================================
   👤 USERS (ADMIN)
===================================================== */
router.get("/users", role("ADMIN"), adminController.getAllUsers);
router.get("/users/:id", role("ADMIN"), adminController.getUserDetail);
router.post("/users", role("ADMIN"), adminController.createUserByAdmin);
router.put("/users/:id", role("ADMIN"), adminController.updateAnyUser);
router.delete("/users/:id", role("ADMIN"), adminController.deleteAnyUser);

/* =====================================================
   🏢 ACCOUNTS (ADMIN)
===================================================== */
router.get("/accounts", role("ADMIN"), adminController.getAllAccounts);

/* =====================================================
   🤖 CHATBOTS (ADMIN)
===================================================== */
router.post("/chatbots", role("ADMIN"), adminController.createChatbotForUser);
router.get("/chatbots", role("ADMIN"), adminController.getAllChatbots);
router.get("/chatbots/:id", role("ADMIN"), adminController.getChatbotDetail);
router.put(
   "/chatbots/:id",
   role("ADMIN"),
   upload.single("avatar"),
   adminController.updateAnyChatbot
);
router.delete("/chatbots/:id", role("ADMIN"), adminController.deleteAnyChatbot);

// ⚙️ acciones específicas
router.patch("/chatbots/:id/toggle", role("ADMIN"), adminController.toggleChatbot);
router.post(
   "/chatbots/:publicId/token/regenerate",
   role("ADMIN"),
   adminController.regenerateInstallToken
);

/* =====================================================
   🎭 AVATARS POR CHATBOT (ADMIN)
===================================================== */
router.get(
   "/chatbots/:id/avatars",
   role("ADMIN"),
   adminController.getAvailableAvatars
);

router.delete(
   "/chatbots/:id/avatars",
   role("ADMIN"),
   adminController.deleteAvatar
);

/* =====================================================
   🖼️ AVATARS GLOBALES (ADMIN)
===================================================== */
router.post(
   "/avatars",
   role("ADMIN"),
   upload.single("avatar"),
   adminController.createAvatar
);

router.get("/avatars", role("ADMIN"), adminController.getAllAvatars);

router.delete(
   "/avatars/:id",
   role("ADMIN"),
   adminController.deleteAvatarGlobal
);

router.patch(
   "/avatars/:id/default",
   role("ADMIN"),
   adminController.setDefaultAvatar
);

/* =====================================================
   📇 CONTACT TEMPLATES (ADMIN)
===================================================== */
router.post(
   "/templates",
   role("ADMIN"),
   adminController.createDefaultContactTemplate
);

router.get(
   "/templates",
   role("ADMIN"),
   adminController.getDefaultContactTemplates
);

router.put(
   "/templates/:id",
   role("ADMIN"),
   adminController.updateDefaultContactTemplate
);

router.delete(
   "/templates/:id",
   role("ADMIN"),
   adminController.deleteDefaultContactTemplate
);

/* =====================================================
   📜 AUDIT LOGS (ADMIN)
===================================================== */
router.get("/audit", role("ADMIN"), adminController.getAuditLogs);

/* =====================================================
   ⚙️ SYSTEM CONFIG (ADMIN)
===================================================== */
router.get("/config", role("ADMIN"), adminController.getSystemConfig);
router.put("/config", role("ADMIN"), adminController.updateSystemConfig);
router.delete("/config", role("ADMIN"), adminController.clearBccEmail);

/* =====================================================
   🆘 SUPPORT CONFIG (ADMIN)
===================================================== */
router.get(
   "/support-config",
   adminController.getSupportConfig
);

router.put(
   "/support-config",
   role("ADMIN"),
   adminController.updateSupportConfig
);

router.delete(
   "/support-config",
   role("ADMIN"),
   adminController.clearSupportConfig
);

module.exports = router;