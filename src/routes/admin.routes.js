const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const adminController = require("../controllers/admin.controller");

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
router.post("/chatbots",adminController.createChatbotForUser);
router.get("/chatbots", adminController.getAllChatbots);
router.get("/chatbots/:id", adminController.getChatbotDetail);
router.delete("/chatbots/:id", adminController.deleteAnyChatbot);
router.put("/chatbots/:id", adminController.updateAnyChatbot);

// flows
router.get("/chatbots/:chatbotId/flows", adminController.getFlowsByChatbot);
router.get("/flows/:id", adminController.getFlowDetail);

// soporte
router.post("/impersonate/:id", adminController.impersonateUser);

// auditorías
router.get("/audit", adminController.getAuditLogs);

module.exports = router;
