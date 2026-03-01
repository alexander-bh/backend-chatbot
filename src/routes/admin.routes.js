const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const adminController = require("../controllers/admin.controller");
const upload = require("../middlewares/uploadAvatar.middleware");

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

router.get(
    "/chatbots/:id/avatars",
    adminController.getAvailableAvatars
);

router.delete(
    "/chatbots/:id/deleteAvatar",
    adminController.deleteAvatar
);

router.patch(
    "/chatbots/:id/toggle",

    adminController.toggleChatbot
);

router.post(
  "/:publicId/token/regenerate",
  adminController.regenerateInstallToken
);


// flows
router.get("/chatbots/:chatbotId/flows", adminController.getFlowsByChatbot);
router.get("/flows/:id", adminController.getFlowDetail);

// soporte
router.post("/impersonate/:id", adminController.impersonateUser);

// auditorías
router.get("/audit", adminController.getAuditLogs);

// auditorías
router.post("/register", adminController.createUserByAdmin);

router.post("/newflows", adminController.createOrReplaceGlobalFlow);

module.exports = router;
