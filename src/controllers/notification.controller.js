const Notification = require("../models/Notification");
const { sendToAccount, sendToAdmin } = require("../services/pusher.service");

/* ─────────────────────────────────────
   HELPER — resuelve el "canal" según rol
   ADMIN  → account_id = "admin"
   CLIENT → account_id = req.user.account_id
───────────────────────────────────── */
const resolveAccountId = (user) =>
  user.role === "ADMIN" ? "admin" : String(user.account_id);

/* ─────────────────────────────────────
   HELPER — dispara el evento correcto
   según el rol del usuario
───────────────────────────────────── */
const notify = (user, event, data) => {
  if (user.role === "ADMIN") return sendToAdmin(event, data);
  return sendToAccount(String(user.account_id), event, data);
};

/* ─────────────────────────────────────
   GET — Obtener notificaciones (paginadas)
───────────────────────────────────── */
exports.getNotifications = async (req, res) => {
  try {
    const accountId = resolveAccountId(req.user);
    const { page = 1, limit = 20, unread_only } = req.query;

    const filter = { account_id: accountId };
    if (unread_only === "true") filter.is_read = false;

    const [notifications, total, unread_count] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({ account_id: accountId, is_read: false }),
    ]);

    res.json({ notifications, total, unread_count, page: Number(page) });
  } catch (err) {
    console.error("GET NOTIFICATIONS ERROR:", err.message) 
    res.status(500).json({ message: err.message });
  }
};

/* ─────────────────────────────────────
   PATCH — Marcar una como leída
───────────────────────────────────── */
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const accountId = resolveAccountId(req.user);

    const updated = await Notification.findOneAndUpdate(
      { _id: id, account_id: accountId },
      { $set: { is_read: true } },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Notificación no encontrada" });
    }

    notify(req.user, "notification-read", { id });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ─────────────────────────────────────
   PATCH — Marcar todas como leídas
───────────────────────────────────── */
exports.markAllAsRead = async (req, res) => {
  try {
    const accountId = resolveAccountId(req.user);

    await Notification.updateMany(
      { account_id: accountId, is_read: false },
      { $set: { is_read: true } }
    );

    notify(req.user, "notifications-read-all", {});

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ─────────────────────────────────────
   GET — Conteo de no leídas
───────────────────────────────────── */
exports.getUnreadCount = async (req, res) => {
  try {
    const accountId = resolveAccountId(req.user);

    const count = await Notification.countDocuments({
      account_id: accountId,
      is_read: false,
    });

    res.json({ unread_count: count });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ─────────────────────────────────────
   DELETE — Eliminar una notificación
───────────────────────────────────── */
exports.deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const accountId = resolveAccountId(req.user);

    const deleted = await Notification.findOneAndDelete({
      _id: id,
      account_id: accountId,
    });

    if (!deleted) {
      return res.status(404).json({ message: "Notificación no encontrada" });
    }

    notify(req.user, "notification-deleted", { id });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ─────────────────────────────────────
   DELETE — Eliminar todas
───────────────────────────────────── */
exports.deleteAllNotifications = async (req, res) => {
  try {
    const accountId = resolveAccountId(req.user);

    const result = await Notification.deleteMany({ account_id: accountId });

    notify(req.user, "notifications-deleted-all", {});

    res.json({ success: true, deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};