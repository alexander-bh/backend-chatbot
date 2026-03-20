const transporter = require("./mailer.service");
const Account = require("../models/Account");
const Notification = require("../models/Notification");
const { sendToAccount } = require("../controllers/sse.controller");

exports.sendContactsDeletedEmail = async ({ accountId, deletedContacts }) => {
    try {
        const account = await Account.findById(accountId).lean();
        if (!account) return;

        /* ── Guardar notificación en BD siempre ────────────────────────────────── */
        const notif = await Notification.create({
            account_id: accountId,
            type: "contacts_deleted",
            title: `${deletedContacts.length} contacto(s) eliminado(s)`,
            message: `Se eliminaron automáticamente ${deletedContacts.length} contacto(s) por superar su fecha límite de descarte.`,
            data: { contacts: deletedContacts },
            is_read: false
        });

        // ← Emitir en tiempo real
        sendToAccount(accountId, {
            type: "new_notification",
            notification: notif
        });

        /* ── Enviar email solo si está habilitado ──────────────────────────────── */
        if (!account.notification_emails_enabled) {
            console.log(`⚠️ Notificaciones email deshabilitadas para cuenta ${accountId}`);
            return;
        }

        if (!account.notification_emails?.length) {
            console.log(`⚠️ Cuenta ${accountId} sin emails configurados`);
            return;
        }

        const fecha = new Date().toLocaleString("es-MX", { timeZone: "America/Mexico_City" });

        const rows = deletedContacts.map((c, i) => `
      <tr style="background:${i % 2 === 0 ? "#ffffff" : "#F7FAFD"};">
        <td style="padding:10px 14px;font-size:13px;color:#1a1a1a;border-bottom:1px solid #E8F0FB;">
          ${c.name || "—"}
        </td>
        <td style="padding:10px 14px;font-size:13px;color:#1a1a1a;border-bottom:1px solid #E8F0FB;">
          ${c.email || "—"}
        </td>
        <td style="padding:10px 14px;font-size:13px;color:#1a1a1a;border-bottom:1px solid #E8F0FB;">
          ${c.phone || "—"}
        </td>
      </tr>
    `).join("");

        const htmlContent = `
      <!DOCTYPE html><html lang="es">
      <head><meta charset="UTF-8"/></head>
      <body style="margin:0;padding:0;background:#F2F2F2;font-family:Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="padding:30px 0;">
          <tr><td align="center">
            <table width="600" cellpadding="0" cellspacing="0"
                   style="background:#fff;border-radius:14px;overflow:hidden;">
              <tr>
                <td style="background:#034AA6;padding:22px 28px;">
                  <h2 style="margin:0;color:#fff;font-size:19px;">${account.name}</h2>
                  <p style="margin:5px 0 0;color:#04C4D9;font-size:12px;text-transform:uppercase;">
                    Contactos eliminados automáticamente
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:20px 28px 4px;border-bottom:1px solid #eee;">
                  <table width="100%">
                    <tr>
                      <td style="font-size:13px;color:#666;padding:5px 0;width:80px;">📅 Fecha:</td>
                      <td style="font-size:13px;color:#111;">${fecha}</td>
                    </tr>
                    <tr>
                      <td style="font-size:13px;color:#666;padding:5px 0;">🗑️ Eliminados:</td>
                      <td style="font-size:13px;color:#111;font-weight:600;">
                        ${deletedContacts.length} contacto(s)
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 28px 24px;">
                  <table width="100%" style="border:1px solid #E8F0FB;border-radius:10px;overflow:hidden;">
                    <thead>
                      <tr>
                        <th style="background:#034AA6;color:#fff;font-size:11px;padding:10px 14px;text-align:left;">👤 Nombre</th>
                        <th style="background:#034AA6;color:#fff;font-size:11px;padding:10px 14px;text-align:left;">✉️ Email</th>
                        <th style="background:#034AA6;color:#fff;font-size:11px;padding:10px 14px;text-align:left;">📞 Teléfono</th>
                      </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="background:#28403D;padding:14px;text-align:center;">
                  <span style="font-size:11px;color:#04C4D9;">Generado automáticamente por tu chatbot</span>
                </td>
              </tr>
            </table>
          </td></tr>
        </table>
      </body></html>
    `;

        await transporter.sendMail({
            from: `"Sistema CRM" <${process.env.SMTP_USE}>`,
            to: account.notification_emails,
            subject: `🗑️ ${deletedContacts.length} contacto(s) eliminado(s) - ${account.name}`,
            html: htmlContent,
        });

        console.log(`📧 Notificación enviada a ${account.notification_emails.join(", ")}`);

    } catch (err) {
        console.error("❌ Error en sendContactsDeletedEmail:", err);
    }
};