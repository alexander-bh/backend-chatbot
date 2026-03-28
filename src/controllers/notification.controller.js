const Notification = require("../models/Notification");
const { sendToAccount, sendToAdmin } = require("../services/pusher.service");
const resolveAccountId = require("../helper/resolveAccountId");
const notify = require("../helper/notify");

exports.createAndEmitNotification = async ({ account_id, role, ...fields }) => {
    const notification = await Notification.create({ account_id, ...fields })

    const payload = {
        _id: notification._id,
        account_id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        body: notification.body,
        metadata: notification.metadata,
        data: notification.data,
        is_read: false,
        createdAt: notification.createdAt,
    }

    try {
        if (role === "ADMIN" || account_id === "admin") {
            await sendToAdmin("notification-new", payload)
        } else {
            await sendToAccount(String(account_id), "notification-new", payload)
        }
    } catch (e) {
        console.error("Pusher emit error:", e.message)
    }

    return notification
}

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