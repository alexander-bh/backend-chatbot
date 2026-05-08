const Chatbot = require("../models/Chatbot");
const SystemConfig = require("../models/SystemConfig");
const { BrevoClient } = require("@getbrevo/brevo");

const log = (level, msg, data = null) => {
  const ts = new Date().toISOString();
  const prefix = { info: "ℹ", warn: "⚠️", error: "❌", ok: "✅", debug: "🔍" }[level] || "▪️";
  const out = data
    ? `${ts} ${prefix} [ConvMail] ${msg} ${JSON.stringify(data, null, 2)}`
    : `${ts} ${prefix} [ConvMail] ${msg}`;
  level === "error" ? console.error(out) : console.log(out);
};

const getBrevoClient = () => {
  return new BrevoClient({ apiKey: process.env.BREVO_API_KEY });
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
    const toEmailRaw = settings.to_email ?? null;

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

    const nombre = [vars.name, vars.last_name].filter(Boolean).join(" ") || "—";
    const phoneClean = (vars.phone || "").replace(/\D/g, "");

    const conversacionTexto = (session.history || [])
      .map((h) => `${h.question || "—"}\n${h.answer || "—"}`)
      .join("\n\n");

    const toList = toEmails.map((e) => ({ email: e }));
    const bccList = bccEmail ? [{ email: bccEmail }] : [];

    log("debug", "Payload enviado", {
      to: toList.length ? toList : bccList,
      bcc: bccList.length && toList.length ? bccList : "(sin bcc)",
      templateId: Number(process.env.BREVO_TEMPLATE_ID),
    });

    const client = getBrevoClient();

    const result = await client.transactionalEmails.sendTransacEmail({
      sender: { name: "Chatbot Anfeta", email: "info@weblab.com.mx" },
      to: toList.length ? toList : bccList,
      ...(bccList.length && toList.length ? { bcc: bccList } : {}),
      templateId: Number(process.env.BREVO_TEMPLATE_ID),
      params: {
        nombre,
        email: vars.email || "—",
        telefono: vars.phone || "—",
        fecha: new Date().toLocaleString("es-MX", { timeZone: "America/Mexico_City" }),
        origen: session.origin_url || "Desconocido",
        whatsapp_link: phoneClean ? `https://wa.me/${phoneClean}` : "#",
        phone_link: phoneClean ? `tel:${phoneClean}` : "#",
        email_link: vars.email ? `mailto:${vars.email}` : "#",
        conversacion: conversacionTexto,
      },
    });

    log("ok", "Email enviado via Brevo", { messageId: result?.messageId });

  } catch (err) {
    log("error", `Falla al enviar email para session ${session._id}`, {
      message: err.message,
      code: err.code || null,
      response: err.response?.text || null,
    });
  }
};