const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth.middleware");
const accountCtrl = require("../controllers/account.controller");

router.get("/my-account", auth, accountCtrl.getMyAccount);
router.get("/notification-emails", auth, accountCtrl.getNotificationEmails);
router.post("/notification-emails", auth, accountCtrl.addNotificationEmail);
router.put("/notification-emails", auth, accountCtrl.updateNotificationEmails);
router.delete("/notification-emails/:email", auth, accountCtrl.removeNotificationEmail);
router.patch("/notification-emails/toggle", auth, accountCtrl.toggleNotificationEmails);

module.exports = router;