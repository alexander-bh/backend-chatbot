const Notification           = require("../models/Notification");
const { sendToAccount }      = require("../services/pusher.service"); // ← nuevo

// Obtener notificaciones (con paginación)
exports.getNotifications = async (req, res) => {
  try {
    const accountId = req.user.account_id;
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
      Notification.countDocuments({ account_id: accountId, is_read: false })
    ]);

    res.json({ notifications, total, unread_count, page: Number(page) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Marcar una como leída
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const accountId = req.user.account_id;

    await Notification.findOneAndUpdate(
      { _id: id, account_id: accountId },
      { $set: { is_read: true } }
    );

    // Sincronizar otros tabs/dispositivos
    sendToAccount(accountId, "notification-read", { id });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Marcar todas como leídas
exports.markAllAsRead = async (req, res) => {
  try {
    const accountId = req.user.account_id;

    await Notification.updateMany(
      { account_id: accountId, is_read: false },
      { $set: { is_read: true } }
    );

    sendToAccount(accountId, "notifications-read-all", {});

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Conteo de no leídas
exports.getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      account_id: req.user.account_id,
      is_read: false
    });
    res.json({ unread_count: count });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Eliminar una
exports.deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const accountId = req.user.account_id;

    const deleted = await Notification.findOneAndDelete({
      _id: id,
      account_id: accountId
    });

    if (!deleted) {
      return res.status(404).json({ message: "Notificación no encontrada" });
    }

    sendToAccount(accountId, "notification-deleted", { id });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Eliminar todas
exports.deleteAllNotifications = async (req, res) => {
  try {
    const accountId = req.user.account_id;

    const result = await Notification.deleteMany({ account_id: accountId });

    sendToAccount(accountId, "notifications-deleted-all", {});

    res.json({ success: true, deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};