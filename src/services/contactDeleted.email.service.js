const transporter = require("./mailer.service");
const Account = require("../models/Account");

exports.sendContactsDeletedEmail = async ({ accountId, deletedContacts }) => {
    try {
        const account = await Account.findById(accountId).lean();

        if (!account?.notification_emails_enabled) {
            console.log(`⚠️ Notificaciones deshabilitadas para cuenta ${accountId}`);
            return;
        }

        if (!account?.notification_emails?.length) {
            console.log(`⚠️ Cuenta ${accountId} sin emails configurados`);
            return;
        }

        const fecha = new Date().toLocaleString("es-MX", { timeZone: "America/Mexico_City" });

        const rows = deletedContacts.map((c, i) => `
      <tr style="background:${i % 2 === 0 ? '#ffffff' : '#F7FAFD'};">
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
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      </head>
      <body style="margin:0;padding:0;background:#F2F2F2;font-family:Arial,Helvetica,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="padding:30px 0;">
          <tr><td align="center">
            <table width="600" cellpadding="0" cellspacing="0"
                   style="background:#ffffff;border-radius:14px;overflow:hidden;">

              <!-- HEADER -->
              <tr>
                <td style="background:#034AA6;padding:22px 28px;">
                  <h2 style="margin:0;color:#ffffff;font-size:19px;font-weight:700;">
                    ${account.name}
                  </h2>
                  <p style="margin:5px 0 0;color:#04C4D9;font-size:12px;
                             letter-spacing:1px;text-transform:uppercase;">
                    Contactos eliminados automáticamente
                  </p>
                </td>
              </tr>

              <!-- INFO GENERAL -->
              <tr>
                <td style="padding:20px 28px 4px;border-bottom:1px solid #eeeeee;">
                  <table width="100%" cellpadding="0" cellspacing="0">
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

              <!-- TABLA CONTACTOS -->
              <tr>
                <td style="padding:16px 28px 24px;">
                  <p style="margin:0 0 12px;font-size:12px;font-weight:700;color:#034AA6;
                             letter-spacing:1px;text-transform:uppercase;">
                    Contactos eliminados
                  </p>
                  <table width="100%" cellpadding="0" cellspacing="0"
                         style="border-radius:10px;overflow:hidden;border:1px solid #E8F0FB;">
                    <thead>
                      <tr>
                        <th style="background:#034AA6;color:#fff;font-size:11px;font-weight:700;
                                   text-transform:uppercase;letter-spacing:0.5px;
                                   padding:10px 14px;text-align:left;">👤 Nombre</th>
                        <th style="background:#034AA6;color:#fff;font-size:11px;font-weight:700;
                                   text-transform:uppercase;letter-spacing:0.5px;
                                   padding:10px 14px;text-align:left;">✉️ Email</th>
                        <th style="background:#034AA6;color:#fff;font-size:11px;font-weight:700;
                                   text-transform:uppercase;letter-spacing:0.5px;
                                   padding:10px 14px;text-align:left;">📞 Teléfono</th>
                      </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                  </table>
                </td>
              </tr>

              <!-- FOOTER -->
              <tr>
                <td style="background:#28403D;padding:14px;text-align:center;">
                  <span style="font-size:11px;color:#04C4D9;letter-spacing:1px;">
                    Generado automáticamente por tu chatbot
                  </span>
                </td>
              </tr>

            </table>
          </td></tr>
        </table>
      </body>
      </html>
    `;

        await transporter.sendMail({
            from: `"Sistema CRM" <${process.env.SMTP_USE}>`,
            to: account.notification_emails,   // ← array, Nodemailer lo acepta directo
            subject: `🗑️ ${deletedContacts.length} contacto(s) eliminado(s) - ${account.name}`,
            html: htmlContent,
        });

        console.log(`📧 Notificación enviada a ${account.notification_emails.join(", ")} (${deletedContacts.length} contactos)`);

    } catch (err) {
        console.error("❌ Error enviando notificación de contactos eliminados:", err);
    }
};