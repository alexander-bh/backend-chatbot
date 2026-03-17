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
      .map((h, i) => `
    <tr style="background:${i % 2 === 0 ? '#F2F2F2' : '#ffffff'};">
      <td style="padding:10px 14px;color:#28403D;font-size:13px;vertical-align:top;
                 border-bottom:1px solid #d0dce8;white-space:nowrap;">
        ${h.question || ""}
      </td>
      <td style="padding:10px 14px;color:#28403D;font-size:13px;
                 border-bottom:1px solid #d0dce8;">
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
<body style="margin:0;padding:0;background:#F2F2F2;font-family:'Courier New',monospace;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F2F2F2;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #d0dce8;">

          <!-- HEADER -->
          <tr>
            <td style="background:#034AA6;padding:20px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <p style="margin:0;color:#04C4D9;font-size:11px;letter-spacing:3px;
                               text-transform:uppercase;">NUEVA CONVERSACIÓN</p>
                    <p style="margin:4px 0 0;color:#F2F2F2;font-size:20px;font-weight:bold;">
                      ${chatbot.name}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- DE / PARA / ASUNTO -->
          <tr>
            <td style="padding:0 28px;background:#F2F2F2;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid #d0dce8;">
                    <span style="color:#049DBF;font-size:12px;text-transform:uppercase;
                                 letter-spacing:1px;">De</span><br>
                    <span style="color:#28403D;font-size:13px;font-weight:bold;">
                      ${emailSettings.from_name || chatbot.name}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid #d0dce8;">
                    <span style="color:#049DBF;font-size:12px;text-transform:uppercase;
                                 letter-spacing:1px;">Para</span><br>
                    <span style="color:#28403D;font-size:13px;font-weight:bold;">
                      ${emailSettings.to_email}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 0;">
                    <span style="color:#049DBF;font-size:12px;text-transform:uppercase;
                                 letter-spacing:1px;">Asunto</span><br>
                    <span style="color:#28403D;font-size:13px;font-weight:bold;">${asunto}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- DATOS DEL CONTACTO -->
          <tr>
            <td style="padding:20px 28px 8px;">
              <p style="margin:0 0 10px;font-size:11px;text-transform:uppercase;
                         letter-spacing:2px;color:#049DBF;">DATOS DEL CONTACTO</p>
              <div style="border-left:3px solid #04C4D9;padding-left:14px;">
                <table cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:4px 12px 4px 0;color:#049DBF;font-size:13px;
                               white-space:nowrap;width:80px;">Nombre</td>
                    <td style="padding:4px 0;color:#28403D;font-size:13px;
                               font-weight:bold;">${nombre}</td>
                  </tr>
                  <tr>
                    <td style="padding:4px 12px 4px 0;color:#049DBF;font-size:13px;">Teléfono</td>
                    <td style="padding:4px 0;color:#28403D;font-size:13px;">${telefono}</td>
                  </tr>
                  <tr>
                    <td style="padding:4px 12px 4px 0;color:#049DBF;font-size:13px;">Email</td>
                    <td style="padding:4px 0;color:#034AA6;font-size:13px;
                               text-decoration:underline;">${email}</td>
                  </tr>
                  <tr>
                    <td style="padding:4px 12px 4px 0;color:#049DBF;font-size:13px;">Origen</td>
                    <td style="padding:4px 0;color:#28403D;font-size:13px;">${origen}</td>
                  </tr>
                  <tr>
                    <td style="padding:4px 12px 4px 0;color:#049DBF;font-size:13px;">Fecha</td>
                    <td style="padding:4px 0;color:#28403D;font-size:13px;">${fecha}</td>
                  </tr>
                </table>
              </div>
            </td>
          </tr>

          <!-- SEPARADOR HISTORIAL -->
          <tr>
            <td style="padding:16px 28px 0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-top:1px solid #d0dce8;width:40%;"></td>
                  <td style="padding:0 12px;white-space:nowrap;color:#049DBF;font-size:11px;
                             letter-spacing:2px;text-transform:uppercase;text-align:center;">
                    Historial de conversación
                  </td>
                  <td style="border-top:1px solid #d0dce8;width:40%;"></td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- TABLA HISTORIAL -->
          ${historyRows ? `
          <tr>
            <td style="padding:12px 28px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="border-radius:8px;overflow:hidden;border:1px solid #d0dce8;">
                <tr style="background:#034AA6;">
                  <td style="padding:8px 14px;color:#04C4D9;font-size:11px;
                             text-transform:uppercase;letter-spacing:1px;width:40%;">Pregunta</td>
                  <td style="padding:8px 14px;color:#04C4D9;font-size:11px;
                             text-transform:uppercase;letter-spacing:1px;">Respuesta</td>
                </tr>
                ${historyRows}
              </table>
            </td>
          </tr>
          ` : ""}

          <!-- FOOTER -->
          <tr>
            <td style="background:#28403D;padding:14px 28px;text-align:center;">
              <p style="margin:0;color:#04C4D9;font-size:11px;letter-spacing:2px;
                         text-transform:uppercase;">
                Generado automáticamente por ${chatbot.name}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>
`;

    const mailOptions = {
      from: `"${emailSettings.from_name || "Chatbot"}" <${process.env.SMTP_USE}>`,
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