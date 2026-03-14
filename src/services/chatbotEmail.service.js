const transporter = require("./mailer.service");
const Chatbot = require("../models/Chatbot");

exports.sendConversationEmail = async (session) => {
  try {
    const chatbot = await Chatbot.findById(session.chatbot_id);
    if (!chatbot) return;

    const emailSettings = chatbot.email_settings || {};

    if (!emailSettings.enabled) return;
    if (!emailSettings.to_email) return;

    const vars = session.variables || {};
    const asunto = emailSettings.from_asunto
      || `Nueva conversación - ${chatbot.name}`;

    /* ================= DATOS DEL CONTACTO ================= */

    const nombre = [vars.name, vars.last_name].filter(Boolean).join(" ") || "—";
    const telefono = vars.phone || "—";
    const email = vars.email || "—";
    const origen = session.origin_url || "Desconocido";
    const fecha = new Date().toLocaleString("es-MX", { timeZone: "America/Mexico_City" });

    /* ================= HISTORIAL ================= */

    const historyRows = (session.history || [])
      .map(h => `
        <tr>
          <td style="padding:8px 12px;color:#9ca3af;font-size:13px;vertical-align:top;white-space:nowrap;">
            ${h.question || ""}
          </td>
          <td style="padding:8px 12px;color:#f3f4f6;font-size:13px;">
            ${h.answer || ""}
          </td>
        </tr>
      `)
      .join("");

    /* ================= HTML ================= */

    const htmlContent = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#111827;font-family:'Courier New',monospace;">

  <table width="100%" cellpadding="0" cellspacing="0"
         style="background:#111827;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0"
               style="background:#1f2937;border-radius:12px;overflow:hidden;">

          <!-- HEADER -->
          <tr>
            <td style="padding:16px 24px;background:#111827;
                        font-size:11px;letter-spacing:2px;
                        color:#6b7280;text-transform:uppercase;">
              VISTA PREVIA DEL CORREO
            </td>
          </tr>

          <!-- DE / PARA / ASUNTO -->
          <tr>
            <td style="padding:0 24px;">
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="border-bottom:1px solid #374151;">
                <tr>
                  <td style="padding:12px 0;color:#6b7280;font-size:13px;width:70px;">De:</td>
                  <td style="padding:12px 0;color:#f3f4f6;font-size:13px;font-weight:bold;">
                    ${emailSettings.from_name || chatbot.name}
                  </td>
                </tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="border-bottom:1px solid #374151;">
                <tr>
                  <td style="padding:12px 0;color:#6b7280;font-size:13px;width:70px;">Para:</td>
                  <td style="padding:12px 0;color:#f3f4f6;font-size:13px;font-weight:bold;">
                    ${emailSettings.to_email}
                  </td>
                </tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="border-bottom:1px solid #374151;">
                <tr>
                  <td style="padding:12px 0;color:#6b7280;font-size:13px;width:70px;">Asunto:</td>
                  <td style="padding:12px 0;color:#f3f4f6;font-size:13px;font-weight:bold;">
                    ${asunto}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- DATOS DEL CONTACTO -->
          <tr>
            <td style="padding:20px 24px 8px;">
              <p style="margin:0 0 6px;color:#d1d5db;font-size:13px;">
                <span style="color:#6b7280;">Nombre: </span>${nombre}
              </p>
              <p style="margin:0 0 6px;color:#d1d5db;font-size:13px;">
                <span style="color:#6b7280;">Teléfono: </span>${telefono}
              </p>
              <p style="margin:0 0 6px;color:#d1d5db;font-size:13px;">
                <span style="color:#6b7280;">Email: </span>${email}
              </p>
              <p style="margin:0 0 6px;color:#d1d5db;font-size:13px;">
                <span style="color:#6b7280;">Origen: </span>${origen}
              </p>
              <p style="margin:0 0 6px;color:#d1d5db;font-size:13px;">
                <span style="color:#6b7280;">Fecha: </span>${fecha}
              </p>
            </td>
          </tr>

          <!-- SEPARADOR HISTORIAL -->
          <tr>
            <td style="padding:4px 24px 0;">
              <p style="margin:0;color:#4b5563;font-size:12px;text-align:center;">
                — Historial de conversación adjunto —
              </p>
            </td>
          </tr>

          <!-- TABLA HISTORIAL -->
          ${historyRows ? `
          <tr>
            <td style="padding:12px 24px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="background:#111827;border-radius:8px;overflow:hidden;">
                ${historyRows}
              </table>
            </td>
          </tr>
          ` : ""}

        </table>
      </td>
    </tr>
  </table>

</body>
</html>
    `;

    const mailOptions = {
      from: `"${emailSettings.from_name || "Chatbot"}" <${process.env.SMTP_USER}>`,
      to: emailSettings.to_email,
      subject: `Nueva conversación - ${chatbot.name}`,
      html: htmlContent
    };

    await transporter.sendMail(mailOptions);
    console.log("📧 Email enviado");

  } catch (err) {
    console.error("❌ Error enviando email:", err);
  }
};