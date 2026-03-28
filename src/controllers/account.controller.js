const Account = require("../models/Account");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Consultar cuenta ──────────────────────────────────────────────────────────
exports.getMyAccount = async (req, res) => {
  try {
    const account = await Account.findById(req.user.account_id);
    if (!account) return res.status(404).json({ message: "Cuenta no encontrada" });
    res.json(account);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ── Obtener emails de notificación ────────────────────────────────────────────
exports.getNotificationEmails = async (req, res) => {
  try {
    const account = await Account.findById(req.user.account_id).lean();
    if (!account) return res.status(404).json({ message: "Cuenta no encontrada" });

    res.json({ notification_emails: account.notification_emails || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ── Agregar email de notificación ─────────────────────────────────────────────
exports.addNotificationEmail = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({ message: "Formato de email inválido" });
    }

    const normalized = email.trim().toLowerCase();

    const account = await Account.findById(req.user.account_id);
    if (!account) return res.status(404).json({ message: "Cuenta no encontrada" });

    if (account.notification_emails.includes(normalized)) {
      return res.status(409).json({ message: "El email ya está registrado" });
    }

    account.notification_emails.push(normalized);
    await account.save();

    res.json({ notification_emails: account.notification_emails });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ── Eliminar email de notificación ────────────────────────────────────────────
exports.removeNotificationEmail = async (req, res) => {
  try {
    const { email } = req.params;
    const normalized = decodeURIComponent(email).trim().toLowerCase();

    const account = await Account.findById(req.user.account_id);
    if (!account) return res.status(404).json({ message: "Cuenta no encontrada" });

    const before = account.notification_emails.length;
    account.notification_emails = account.notification_emails.filter(
      e => e !== normalized
    );

    if (account.notification_emails.length === before) {
      return res.status(404).json({ message: "Email no encontrado" });
    }

    await account.save();

    res.json({ notification_emails: account.notification_emails });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ── Reemplazar todos los emails ───────────────────────────────────────────────
exports.updateNotificationEmails = async (req, res) => {
  try {
    const { emails } = req.body;

    if (!Array.isArray(emails)) {
      return res.status(400).json({ message: "Se esperaba un array de emails" });
    }

    const invalid = emails.filter(e => !EMAIL_REGEX.test(e?.trim()));
    if (invalid.length > 0) {
      return res.status(400).json({
        message: "Emails inválidos",
        invalid
      });
    }

    const normalized = [...new Set(emails.map(e => e.trim().toLowerCase()))];

    const account = await Account.findByIdAndUpdate(
      req.user.account_id,
      { $set: { notification_emails: normalized } },
      { returnDocument: "after" }  // ← aquí
    );

    if (!account) return res.status(404).json({ message: "Cuenta no encontrada" });

    res.json({ notification_emails: account.notification_emails });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.toggleNotificationEmails = async (req, res) => {
  try {
    const { enabled } = req.body;

    if (typeof enabled !== "boolean") {
      return res.status(400).json({ message: "El campo 'enabled' debe ser booleano" });
    }

    const account = await Account.findByIdAndUpdate(
      req.user.account_id,
      { $set: { notification_emails_enabled: enabled } },
      { returnDocument: "after" }
    );
    if (!account) return res.status(404).json({ message: "Cuenta no encontrada" });

    res.json({ notification_emails_enabled: account.notification_emails_enabled });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};