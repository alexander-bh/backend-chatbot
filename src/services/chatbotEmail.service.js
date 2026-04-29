const transporter = require("./mailer.service");
const Chatbot = require("../models/Chatbot");
const SystemConfig = require("../models/SystemConfig");

const log = (level, msg, data = null) => {
  const ts = new Date().toISOString();
  const prefix = { info: "ℹ️", warn: "⚠️", error: "❌", ok: "✅", debug: "🔍" }[level] || "▪️";
  const out = data
    ? `${ts} ${prefix} [ConvMail] ${msg} ${JSON.stringify(data, null, 2)}`
    : `${ts} ${prefix} [ConvMail] ${msg}`;
  level === "error" ? console.error(out) : console.log(out);
};

exports.sendConversationEmail = async (session, contact = null) => {
  log("info", `Iniciando envío — session: ${session._id}`);

  try {
    const [chatbot, bccConfig] = await Promise.all([
      Chatbot.findById(session.chatbot_id).lean(),
      SystemConfig.findOne({ key: "bcc_email" }).lean(),
    ]);

    if (!chatbot) {
      log("warn", `Chatbot no encontrado: ${session.chatbot_id}`);
      return;
    }

    const bccEmail = bccConfig?.value?.trim() || process.env.BCC_EMAIL || "";
    const settings = chatbot.email_settings || {};
    const toEmailRaw = settings.enabled ? settings.to_email : null;

    const toEmails = Array.isArray(toEmailRaw)
      ? toEmailRaw.filter(Boolean)
      : typeof toEmailRaw === "string" && toEmailRaw.trim()
        ? toEmailRaw.split(",").map((e) => e.trim()).filter(Boolean)
        : [];

    if (!toEmails.length && !bccEmail) {
      log("warn", "Sin destinatarios — se omite el envío");
      return;
    }

    const vars = {
      ...(session.variables || {}),
      ...(contact
        ? Object.fromEntries(
          Object.entries({
            name: contact.name,
            last_name: contact.last_name,
            email: contact.email,
            phone: contact.phone,
          }).filter(([_, v]) => v != null && v !== "")
        )
        : {}),
    };
    
    const params = buildParams({ chatbot, session, vars });

    log("debug", "Destinatarios", { to: toEmails, bcc: bccEmail || "(vacío)" });

    const info = await transporter.sendMail({
      from: `"ChatbotAnfeta" <info@weblab.com.mx>`,
      to: toEmails.length ? toEmails.join(", ") : bccEmail,
      ...(bccEmail && toEmails.length && { bcc: bccEmail }),
      subject: `Nueva conversación — ${params.nombre}`,
      html: buildHtml(params),
    });

    log("ok", "Email enviado", { messageId: info.messageId });

  } catch (err) {
    log("error", `Falla al enviar email para session ${session._id}`, {
      message: err.message,
      code: err.code || null,
    });
  }
};

// ─── Parámetros ──────────────────────────────────────────────────────────────
function buildParams({ chatbot, session, vars }) {
  const nombre = [vars.name, vars.last_name].filter(Boolean).join(" ") || "—";
  const telefono = vars.phone || "—";
  const email = vars.email || "—";
  const origen = session.origin_url || "Desconocido";
  const fecha = new Date().toLocaleString("es-MX", { timeZone: "America/Mexico_City" });

  const phoneClean = (vars.phone || "").replace(/\D/g, "");
  const whatsappLink = phoneClean ? `https://wa.me/${phoneClean}` : "#";
  const phoneLink = phoneClean ? `tel:${phoneClean}` : "#";
  const emailLink = vars.email ? `mailto:${vars.email}` : "#";

  const conversacion = (session.history || [])
    .map((h) => ({ bot: h.question || "—", usuario: h.answer || "—" }));

  return {
    nombre, email, telefono, fecha, origen,
    whatsappLink, phoneLink, emailLink, conversacion
  };
}

// ─── HTML ────────────────────────────────────────────────────────────────────
function buildHtml({ nombre, email, telefono, fecha, origen,
  whatsappLink, phoneLink, emailLink, conversacion }) {

  const mensaje = conversacion
    .map(({ bot, usuario }) => `${bot}\n${usuario}`)
    .join("\n\n");

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#111827;">
  <table width="560" cellpadding="0" cellspacing="0" border="0"
         style="max-width:560px;margin:0 auto;padding:24px 16px;">
    <tr>
      <td align="left">

        <!-- Encabezado -->
        <p style="margin:0 0 4px 0;font-size:12px;color:#6B7280;text-transform:uppercase;">
          WebLab
        </p>
        <h1 style="margin:0 0 20px 0;font-size:20px;font-weight:bold;color:#111827;">
          Nuevo mensaje recibido
        </h1>
        <hr style="border:none;border-top:1px solid #E5E7EB;margin:0 0 20px 0;">

        <!-- Datos del contacto -->
        <p style="margin:0 0 10px 0;font-size:12px;color:#6B7280;text-transform:uppercase;">
          Información del contacto
        </p>
        <p style="margin:0 0 6px 0;font-size:14px;"><strong>Nombre:</strong> ${nombre}</p>
        <p style="margin:0 0 6px 0;font-size:14px;"><strong>Email:</strong> ${email}</p>
        <p style="margin:0 0 6px 0;font-size:14px;"><strong>Teléfono:</strong> ${telefono}</p>
        <p style="margin:0 0 6px 0;font-size:14px;"><strong>Fecha:</strong> ${fecha}</p>
        <p style="margin:0 0 16px 0;font-size:14px;"><strong>Origen:</strong> ${origen}</p>

        <hr style="border:none;border-top:1px solid #E5E7EB;margin:20px 0;">

        <!-- Botones -->
        <p style="margin:0 0 12px 0;font-size:13px;color:#6B7280;">Acciones rápidas:</p>

        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td align="center">
              <table width="280" cellpadding="0" cellspacing="0" border="0">

                <!-- WhatsApp -->
                <tr>
                  <td width="280" height="42" align="center" valign="middle"
                      bgcolor="#16A34A"
                      style="border-radius:6px;mso-padding-alt:0;">
                    <a href="${whatsappLink}"
                       style="display:block;padding:11px 20px;font-size:14px;font-weight:bold;
                              color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">
                      Escribir por WhatsApp
                    </a>
                  </td>
                </tr>

                <tr><td height="8"></td></tr>

                <!-- Llamar -->
                <tr>
                  <td width="280" height="42" align="center" valign="middle"
                      bgcolor="#1D4ED8"
                      style="border-radius:6px;mso-padding-alt:0;">
                    <a href="${phoneLink}"
                       style="display:block;padding:11px 20px;font-size:14px;font-weight:bold;
                              color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">
                      Llamar por teléfono
                    </a>
                  </td>
                </tr>

                <tr><td height="8"></td></tr>

                <!-- Email -->
                <tr>
                  <td width="280" height="42" align="center" valign="middle"
                      bgcolor="#ffffff"
                      style="border-radius:6px;border:1px solid #D1D5DB;mso-padding-alt:0;">
                    <a href="${emailLink}"
                       style="display:block;padding:11px 20px;font-size:14px;font-weight:bold;
                              color:#374151;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">
                      Responder por email
                    </a>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>

        <hr style="border:none;border-top:1px solid #E5E7EB;margin:20px 0;">

        <!-- Conversación -->
        <p style="margin:0 0 8px 0;font-size:12px;color:#6B7280;text-transform:uppercase;">
          Conversación
        </p>
        <p style="margin:0 0 16px 0;font-size:14px;color:#374151;white-space:pre-line;line-height:1.6;">
          ${mensaje}
        </p>

        <hr style="border:none;border-top:1px solid #E5E7EB;margin:20px 0;">

        <!-- Footer -->
        <p style="margin:0;font-size:12px;color:#9CA3AF;">
          Mensaje automático generado por Chatbot WebLab.
        </p>

      </td>
    </tr>
  </table>
</body>
</html>`;
}