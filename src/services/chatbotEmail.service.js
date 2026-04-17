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

    // ✅ Extraer construcción del HTML a función separada (más limpio y testeable)
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

  const historyHTML = (session.history || [])
    .map(
      (h, i) => `
      <tr style="background:${i % 2 === 0 ? "#ffffff" : "#F7FAFD"};">
        <td style="padding:12px 14px;font-size:13px;color:#1a1a1a;line-height:1.5;
                   border-bottom:1px solid #E8F0FB;width:50%;vertical-align:top;">
          ${h.question || "—"}
        </td>
        <td style="padding:12px 14px;font-size:13px;color:#1a1a1a;line-height:1.5;
                   border-bottom:1px solid #E8F0FB;width:50%;vertical-align:top;
                   background:${i % 2 === 0 ? "#ffffff" : "#F7FAFD"};">
          ${h.answer || "—"}
        </td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#F2F2F2;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:30px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:14px;overflow:hidden;">
        <tr>
          <td style="background:#034AA6;padding:22px 28px;">
            <h2 style="margin:0;color:#ffffff;font-size:19px;font-weight:700;">${chatbot.name}</h2>
            <p style="margin:5px 0 0;color:#FFFFFF;font-size:12px;letter-spacing:1px;text-transform:uppercase;">
              Nueva conversación recibida
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 28px 4px;border-bottom:1px solid #eeeeee;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:13px;color:#666;padding:5px 0;width:80px;">📌 Asunto:</td>
                <td style="font-size:13px;color:#111;font-weight:600;">${asunto}</td>
              </tr>
              <tr>
                <td style="font-size:13px;color:#666;padding:5px 0;">📅 Fecha:</td>
                <td style="font-size:13px;color:#111;">${fecha}</td>
              </tr>
              <tr>
                <td style="font-size:13px;color:#666;padding:5px 0;">🌐 Origen:</td>
                <td style="font-size:13px;color:#034AA6;">${origen}</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="background:#F2F2F2;border-radius:10px;padding:16px;border-left:4px solid #034AA6;">
              <tr>
                <td colspan="2" style="font-size:12px;font-weight:700;color:#034AA6;
                                       padding-bottom:10px;letter-spacing:1px;text-transform:uppercase;">
                  Información del cliente
                </td>
              </tr>
              <tr>
                <td style="font-size:13px;color:#666;padding:4px 0;width:90px;">Nombre:</td>
                <td style="font-size:13px;color:#111;font-weight:500;">${nombre}</td>
              </tr>
              <tr>
                <td style="font-size:13px;color:#666;padding:4px 0;">Teléfono:</td>
                <td style="font-size:13px;color:#111;">${telefono}</td>
              </tr>
              <tr>
                <td style="font-size:13px;color:#666;padding:4px 0;">Email:</td>
                <td style="font-size:13px;color:#034AA6;">${email}</td>
              </tr>
            </table>
          </td>
        </tr>
        ${historyHTML ? `
        <tr>
          <td style="padding:4px 28px 24px;">
            <p style="margin:0 0 12px;font-size:12px;font-weight:700;color:#034AA6;
                      letter-spacing:1px;text-transform:uppercase;">
              Historial de conversación
            </p>
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="border-radius:10px;overflow:hidden;border:1px solid #E8F0FB;">
              <thead>
                <tr>
                  <th style="background:#034AA6;color:#ffffff;font-size:11px;font-weight:700;
                             text-transform:uppercase;letter-spacing:0.5px;
                             padding:10px 14px;text-align:left;width:50%;">🤖 Bot</th>
                  <th style="background:#034AA6;color:#ffffff;font-size:11px;font-weight:700;
                             text-transform:uppercase;letter-spacing:0.5px;
                             padding:10px 14px;text-align:left;width:50%;">👤 Usuario</th>
                </tr>
              </thead>
              <tbody>${historyHTML}</tbody>
            </table>
          </td>
        </tr>` : ""}
        <tr>
          <td style="background:#28403D;padding:14px;text-align:center;">
            <span style="font-size:11px;color:#FFFFFF;letter-spacing:1px;">
              Generado automáticamente por tu chatbot
            </span>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}