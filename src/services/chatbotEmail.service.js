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
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>

<body style="margin:0;padding:0;background:#F2F2F2;font-family:Arial,Helvetica,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="padding:30px 0;">
    <tr>
      <td align="center">

        <!-- CONTAINER -->
        <table width="600" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.08);">

          <!-- HEADER -->
          <tr>
            <td style="background:linear-gradient(135deg,#034AA6,#049DBF);padding:20px 24px;">
              <h2 style="margin:0;color:#ffffff;font-size:18px;">
                ${chatbot.name}
              </h2>
              <p style="margin:4px 0 0;color:#e0f7fa;font-size:12px;">
                Nueva conversación recibida
              </p>
            </td>
          </tr>

          <!-- INFO GENERAL -->
          <tr>
            <td style="padding:20px 24px;">
              
              <table width="100%" cellpadding="0" cellspacing="0">

                <tr>
                  <td style="font-size:13px;color:#555;padding:6px 0;">📌 Asunto:</td>
                  <td style="font-size:13px;color:#111;font-weight:bold;">${asunto}</td>
                </tr>

                <tr>
                  <td style="font-size:13px;color:#555;padding:6px 0;">📅 Fecha:</td>
                  <td style="font-size:13px;color:#111;">${fecha}</td>
                </tr>

                <tr>
                  <td style="font-size:13px;color:#555;padding:6px 0;">🌐 Origen:</td>
                  <td style="font-size:13px;color:#111;">${origen}</td>
                </tr>

              </table>

            </td>
          </tr>

          <!-- CONTACTO CARD -->
          <tr>
            <td style="padding:0 24px 16px;">
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="background:#F2F2F2;border-radius:10px;padding:16px;">

                <tr>
                  <td colspan="2" style="font-size:14px;font-weight:bold;color:#034AA6;padding-bottom:10px;">
                    Información del cliente
                  </td>
                </tr>

                <tr>
                  <td style="font-size:13px;color:#555;">Nombre:</td>
                  <td style="font-size:13px;color:#111;">${nombre}</td>
                </tr>

                <tr>
                  <td style="font-size:13px;color:#555;">Teléfono:</td>
                  <td style="font-size:13px;color:#111;">${telefono}</td>
                </tr>

                <tr>
                  <td style="font-size:13px;color:#555;">Email:</td>
                  <td style="font-size:13px;color:#111;">${email}</td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- HISTORIAL -->
          ${historyRows ? `
          <tr>
            <td style="padding:0 24px 20px;">

              <p style="margin:10px 0 14px;font-size:14px;font-weight:bold;color:#034AA6;">
                Historial de conversación
              </p>

              ${(session.history || []).map(h => `
                <div style="margin-bottom:12px;">
                  
                  <!-- USER -->
                  <div style="background:#e6f7fb;padding:10px 12px;border-radius:8px;margin-bottom:4px;">
                    <span style="font-size:12px;color:#049DBF;font-weight:bold;">Usuario</span><br/>
                    <span style="font-size:13px;color:#111;">${h.question || ""}</span>
                  </div>

                  <!-- BOT -->
                  <div style="background:#28403D;padding:10px 12px;border-radius:8px;">
                    <span style="font-size:12px;color:#04C4D9;font-weight:bold;">Bot</span><br/>
                    <span style="font-size:13px;color:#F2F2F2;">${h.answer || ""}</span>
                  </div>

                </div>
              `).join("")}

            </td>
          </tr>
          ` : ""}

          <!-- FOOTER -->
          <tr>
            <td style="background:#F2F2F2;padding:14px;text-align:center;">
              <span style="font-size:11px;color:#777;">
                Generado automáticamente por tu chatbot
              </span>
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