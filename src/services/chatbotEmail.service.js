const axios = require("axios");
const Chatbot = require("../models/Chatbot");
const SystemConfig = require("../models/SystemConfig");

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_TEMPLATE_ID = parseInt(process.env.BREVO_TEMPLATE_ID);

exports.sendConversationEmail = async (session) => {
  try {
    const [chatbot, bccConfig] = await Promise.all([
      Chatbot.findById(session.chatbot_id).lean(),
      SystemConfig.findOne({ key: "bcc_email" }).lean(),
    ]);

    if (!chatbot) {
      console.warn("⚠️ Chatbot no encontrado:", session.chatbot_id);
      return;
    }

    const bccEmail = bccConfig?.value?.trim() || process.env.BCC_EMAIL || "";
    const emailSettings = chatbot.email_settings || {};

    const toEmailRaw = emailSettings.enabled ? emailSettings.to_email : null;
    const toEmails = Array.isArray(toEmailRaw)
      ? toEmailRaw.filter((e) => e?.trim())
      : typeof toEmailRaw === "string" && toEmailRaw.trim()
        ? toEmailRaw.split(",").map((e) => e.trim()).filter(Boolean)
        : [];

    if (toEmails.length === 0 && !bccEmail) {
      console.warn("⚠️ Sin destinatarios, se omite el envío.");
      return;
    }

    const vars = session.variables || {};
    if (!vars.name && !vars.email && !vars.phone && toEmails.length === 0) {
      console.warn("⚠️ Sin variables de contacto ni destinatarios directos.");
      return;
    }

    const params = buildTemplateParams({ chatbot, emailSettings, session, vars });

    const to = toEmails.length > 0
      ? toEmails.map((e) => ({ email: e }))
      : [{ email: bccEmail }];

    const bcc = bccEmail && toEmails.length > 0
      ? [{ email: bccEmail }]
      : undefined;

    const payload = {
      to,
      ...(bcc && { bcc }),
      templateId: BREVO_TEMPLATE_ID,
      params,
    };

    await axios.post("https://api.brevo.com/v3/smtp/email", payload, {
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
      },
    });

    console.log("✅ Email enviado via Brevo");
  } catch (err) {
    console.error("❌ Error enviando email:", err.response?.data || err.message);
  }
};

function buildTemplateParams({ chatbot, emailSettings, session, vars }) {
  const nombre = [vars.name, vars.last_name].filter(Boolean).join(" ") || "—";
  const telefono = vars.phone || "—";
  const email = vars.email || "—";
  const origen = session.origin_url || "Desconocido";
  const fecha = new Date().toLocaleString("es-MX", { timeZone: "America/Mexico_City" });

  const phoneClean = (vars.phone || "").replace(/\D/g, "");
  const whatsappLink = phoneClean ? `https://wa.me/${phoneClean}` : "#";
  const phoneLink = phoneClean ? `tel:${phoneClean}` : "#";
  const emailLink = vars.email ? `mailto:${vars.email}` : "#";

  const mensaje = (session.history || [])
    .map((h) => `Bot: ${h.question || "—"}\nUsuario: ${h.answer || "—"}`)
    .join("\n\n");

  return {
    nombre,
    email,
    telefono,
    fecha,
    origen,
    whatsappLink,
    phoneLink,
    emailLink,
    mensaje: mensaje || "Sin conversación registrada.",
  };
}