const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const ctrl = require("../controllers/notification.controller");

router.get("/", auth, ctrl.getNotifications);
router.get("/unread-count", auth, ctrl.getUnreadCount);
router.patch("/read-all", auth, ctrl.markAllAsRead);
router.patch("/:id/read", auth, ctrl.markAsRead);
router.delete("/all", auth, ctrl.deleteAllNotifications);  // ← nuevo
router.delete("/:id", auth, ctrl.deleteNotification);      // ← nuevo

module.exports = router;