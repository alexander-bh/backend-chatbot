const transporter = require("./mailer.service");
const renderTemplate = require("../utils/renderTemplate");

/**
 * Ejecuta notificaciones configuradas en un nodo
 * @param {Object} node - FlowNode
 * @param {Object} session - ConversationSession
 */
module.exports = async function executeNodeNotification(node, session) {
  try {
    const notify = node.meta?.notify;
    if (!notify?.enabled) return;

    // Tipo (opcional, default email)
    if (notify.type && notify.type !== "email") return;

    const variables = session.variables || {};

    /* ───────── DESTINATARIOS ───────── */
    const recipients = notify.recipients || notify.to;

    if (!recipients || (Array.isArray(recipients) && recipients.length === 0)) {
      return;
    }

    const to = Array.isArray(recipients)
      ? recipients.join(",")
      : recipients;

    /* ───────── SUBJECT ───────── */
    const subject = renderTemplate(
      notify.subject || "Nueva notificación",
      variables
    );

    /* ───────── BODY / HTML ───────── */
    const html = renderTemplate(
      notify.template || notify.body || "",
      variables
    );

    /* ───────── SEND EMAIL ───────── */
    await transporter.sendMail({
      from: notify.from || `"Chatbot" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html
    });

  } catch (error) {
    // 🔥 Importante: NO romper el flujo del chatbot
    console.error("executeNodeNotification error:", error);
  }
};
