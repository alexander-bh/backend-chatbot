const transporter = require("./mailer.service");
const Chatbot = require("../models/Chatbot");
const SystemConfig = require("../models/SystemConfig");

exports.sendConversationEmail = async (session) => {
  try {
    const [chatbot, bccConfig] = await Promise.all([
      Chatbot.findById(session.chatbot_id).lean(),
      SystemConfig.findOne({ key: "bcc_email" }).lean(),
    ]);

    if (!chatbot) return;

    const bccEmail = bccConfig?.value?.trim() || process.env.BCC_EMAIL || "";
    const emailSettings = chatbot.email_settings || {};

    const toEmailRaw = emailSettings.enabled ? emailSettings.to_email : null;
    const toEmails = Array.isArray(toEmailRaw)
      ? toEmailRaw.filter((e) => e?.trim())
      : typeof toEmailRaw === "string" && toEmailRaw.trim()
        ? toEmailRaw.split(",").map((e) => e.trim()).filter(Boolean)
        : [];

    if (toEmails.length === 0 && !bccEmail) return;

    const vars = session.variables || {};
    if (!vars.name && !vars.email && !vars.phone && toEmails.length === 0) return;

    const html = buildEmailHTML({ chatbot, emailSettings, session, vars });

    const asunto = emailSettings.from_asunto || `Nueva conversación - ${chatbot.name}`;

    await transporter.sendMail({
      from: `"${emailSettings.from_name || "Chatbot"}" <${process.env.SMTP_USER}>`,
      to: toEmails.length > 0 ? toEmails : undefined,
      bcc: bccEmail || undefined,
      subject: asunto,
      html,
    });
  } catch (err) {
    console.error("❌ Error enviando email:", err);
  }
};

function buildEmailHTML({ chatbot, emailSettings, session, vars }) {
  const asunto = emailSettings.from_asunto || `Nueva conversación - ${chatbot.name}`;
  const nombre = [vars.name, vars.last_name].filter(Boolean).join(" ") || "—";
  const telefono = vars.phone || "—";
  const email = vars.email || "—";
  const origen = session.origin_url || "Desconocido";
  const fecha = new Date().toLocaleString("es-MX", { timeZone: "America/Mexico_City" });
  const phoneClean = (vars.phone || "").replace(/\D/g, "");
  const whatsappLink = phoneClean ? `https://wa.me/${phoneClean}` : "https://wa.me/";
  const phoneLink = phoneClean ? `tel:${phoneClean}` : "#";

  const historyHTML = (session.history || [])
    .map(
      (h, i) => `
      <tr>
        <td style="padding:12px 14px;font-size:13px;color:#1a1a1a;line-height:1.6;
                   border-bottom:1px solid #E2E8F0;width:50%;vertical-align:top;
                   background:${i % 2 === 0 ? "#ffffff" : "#F8FAFC"};">
          ${h.question || "—"}
        </td>
        <td style="padding:12px 14px;font-size:13px;color:#1a1a1a;line-height:1.6;
                   border-bottom:1px solid #E2E8F0;width:50%;vertical-align:top;
                   background:${i % 2 === 0 ? "#ffffff" : "#F8FAFC"};">
          ${h.answer || "—"}
        </td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <!--[if mso]>
  <noscript>
    <xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#F1F5F9;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

  <!-- Wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F1F5F9;padding:24px 0;">
    <tr>
      <td align="center" style="padding:0 12px;">

        <!-- Card -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0"
               style="max-width:580px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #E2E8F0;">

          <!-- Header -->
          <tr>
            <td style="background:#034AA6;padding:24px 28px;">
              <div style="font-size:20px;font-weight:700;color:#ffffff;margin:0 0 4px 0;">${chatbot.name}</div>
              <div style="font-size:11px;font-weight:600;color:#BFDBFE;letter-spacing:1.5px;text-transform:uppercase;">
                Nueva conversación recibida
              </div>
            </td>
          </tr>

          <!-- Meta info -->
          <tr>
            <td style="padding:20px 28px 16px;border-bottom:1px solid #F1F5F9;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-size:13px;color:#64748B;padding:5px 0;width:80px;white-space:nowrap;">
                    📌 <strong>Asunto:</strong>
                  </td>
                  <td style="font-size:13px;color:#1E293B;font-weight:600;padding:5px 0;">${asunto}</td>
                </tr>
                <tr>
                  <td style="font-size:13px;color:#64748B;padding:5px 0;white-space:nowrap;">
                    📅 <strong>Fecha:</strong>
                  </td>
                  <td style="font-size:13px;color:#1E293B;padding:5px 0;">${fecha}</td>
                </tr>
                <tr>
                  <td style="font-size:13px;color:#64748B;padding:5px 0;white-space:nowrap;">
                    🌐 <strong>Origen:</strong>
                  </td>
                  <td style="font-size:13px;color:#034AA6;padding:5px 0;word-break:break-all;">${origen}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Datos del cliente -->
          <tr>
            <td style="padding:20px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="background:#F8FAFC;border-radius:12px;border:1px solid #E2E8F0;">
                <tr>
                  <td colspan="2" style="padding:16px 16px 10px;font-size:11px;font-weight:700;
                                         color:#034AA6;letter-spacing:1px;text-transform:uppercase;">
                    Información del contacto
                  </td>
                </tr>
                <tr>
                  <td style="font-size:13px;color:#64748B;padding:6px 16px;width:90px;">Nombre:</td>
                  <td style="font-size:13px;color:#1E293B;font-weight:600;padding:6px 16px;">${nombre}</td>
                </tr>
                <tr>
                  <td style="font-size:13px;color:#64748B;padding:6px 16px;">Teléfono:</td>
                  <td style="font-size:13px;color:#1E293B;padding:6px 16px;">${telefono}</td>
                </tr>
                <tr>
                  <td style="font-size:13px;color:#64748B;padding:6px 16px 16px;">Email:</td>
                  <td style="font-size:13px;color:#034AA6;padding:6px 16px 16px;word-break:break-all;">${email}</td>
                </tr>
              </table>
            </td>
          </tr>

          ${historyHTML ? `
          <!-- Historial -->
          <tr>
            <td style="padding:0 28px 24px;">
              <div style="font-size:11px;font-weight:700;color:#034AA6;letter-spacing:1px;
                          text-transform:uppercase;margin-bottom:12px;">
                Historial de conversación
              </div>
              <table width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="border-radius:10px;overflow:hidden;border:1px solid #E2E8F0;">
                <thead>
                  <tr>
                    <th style="background:#034AA6;color:#ffffff;font-size:11px;font-weight:700;
                               text-transform:uppercase;padding:10px 14px;text-align:left;
                               width:50%;border-right:1px solid #1a5fc4;">🤖 Bot</th>
                    <th style="background:#034AA6;color:#ffffff;font-size:11px;font-weight:700;
                               text-transform:uppercase;padding:10px 14px;text-align:left;width:50%;">👤 Usuario</th>
                  </tr>
                </thead>
                <tbody>
                  ${historyHTML}
                </tbody>
              </table>
            </td>
          </tr>` : ""}

          <!-- Botones — cada uno en su propia fila para máxima compatibilidad móvil -->
          <tr>
            <td style="padding:8px 28px 12px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <!-- Botón WhatsApp -->
                <tr>
                  <td style="padding-bottom:12px;">
                    <a href="${whatsappLink}" target="_blank"
                       style="display:block;padding:15px 24px;background:#25D366;color:#ffffff;
                              font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;
                              text-decoration:none;border-radius:10px;text-align:center;">
                        Contactar por WhatsApp
                    </a>
                  </td>
                </tr>
                <!-- Botón Llamar -->
                <tr>
                  <td style="padding-bottom:8px;">
                    <a href="${phoneLink}"
                       style="display:block;padding:15px 24px;background:#034AA6;color:#ffffff;
                              font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;
                              text-decoration:none;border-radius:10px;text-align:center;">
                      Llamar por teléfono
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#1E293B;padding:16px;text-align:center;border-radius:0 0 16px 16px;">
              <span style="font-size:11px;color:#94A3B8;letter-spacing:0.5px;">
                Mensaje automático de <strong style="color:#CBD5E1;">${chatbot.name}</strong> · ${new Date().getFullYear()}
              </span>
            </td>
          </tr>

        </table>
        <!-- /Card -->

      </td>
    </tr>
  </table>

</body>
</html>`;
}