const { sendContactsDeletedEmail } = require("../services/contactDeleted.email.service");

exports.notifyContactsDeleted = async (req, res) => {
  try {
    const secret = req.headers["x-webhook-secret"];
    if (secret !== process.env.WEBHOOK_SECRET) {
      return res.status(401).json({ message: "No autorizado" });
    }

    const { accountId, deletedContacts } = req.body;

    if (!accountId || !Array.isArray(deletedContacts) || deletedContacts.length === 0) {
      return res.status(400).json({ message: "Datos inválidos" });
    }

    // Responder inmediato para no bloquear el trigger
    res.json({ received: true });

    // El servicio ya maneja internamente si no hay emails configurados
    await sendContactsDeletedEmail({ accountId, deletedContacts });

  } catch (err) {
    console.error("NOTIFY CONTACTS DELETED ERROR:", err);
    // res.status ya fue enviado, solo loggear
  }
};