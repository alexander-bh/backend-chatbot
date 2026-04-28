const axios = require("axios");
const Chatbot = require("../models/Chatbot");
const SystemConfig = require("../models/SystemConfig");

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_TEMPLATE_ID = parseInt(process.env.BREVO_TEMPLATE_ID);

// ─── Utilidad: log con timestamp ────────────────────────────────────────────
const log = (level, msg, data = null) => {
  const ts = new Date().toISOString();
  const prefix = { info: "ℹ️", warn: "⚠️", error: "❌", ok: "✅", debug: "🔍" }[level] || "▪️";
  if (data) {
    console[level === "error" ? "error" : "log"](`${ts} ${prefix} [Brevo] ${msg}`, JSON.stringify(data, null, 2));
  } else {
    console[level === "error" ? "error" : "log"](`${ts} ${prefix} [Brevo] ${msg}`);
  }
};

// ─── Envío con reintentos ────────────────────────────────────────────────────
const sendWithRetry = async (payload, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    const attempt = i + 1;
    log("info", `Intento ${attempt}/${retries} — enviando a Brevo...`);

    try {
      const res = await axios.post("https://api.brevo.com/v3/smtp/email", payload, {
        headers: {
          "api-key": BREVO_API_KEY,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      });

      log("ok", `Email enviado en intento ${attempt}`, {
        status: res.status,
        messageId: res.data?.messageId,
      });
      return res;

    } catch (err) {
      const isLast = attempt === retries;

      // ── Clasificar el tipo de error ──────────────────────────────────────
      if (err.response) {
        // Brevo respondió con un código HTTP de error
        log("error", `Error HTTP de Brevo (intento ${attempt})`, {
          status: err.response.status,
          statusText: err.response.statusText,
          data: err.response.data,
          headers: err.response.headers,
        });
      } else if (err.request) {
        // La petición salió pero no hubo respuesta
        const netInfo = {
          code: err.code,                   // ECONNRESET, ETIMEDOUT, ENOTFOUND…
          message: err.message,
          syscall: err.syscall || null,
          address: err.address || null,
          port: err.port || null,
          timeout: err.config?.timeout,
        };
        log("error", `Sin respuesta del servidor (intento ${attempt})`, netInfo);
      } else {
        // Error antes de enviar (config, etc.)
        log("error", `Error al armar la petición (intento ${attempt})`, {
          message: err.message,
          stack: err.stack,
        });
      }

      if (isLast) {
        log("error", `Todos los intentos fallaron (${retries}/${retries})`);
        throw err;
      }

      const wait = attempt * 2000; // 2s, 4s
      log("warn", `Reintentando en ${wait / 1000}s...`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
};

// ─── Función principal ───────────────────────────────────────────────────────
exports.sendConversationEmail = async (session) => {
  log("info", `Iniciando envío — session: ${session._id}`);

  // 1. Variables de entorno
  log("debug", "Variables de entorno", {
    BREVO_API_KEY: BREVO_API_KEY ? `...${BREVO_API_KEY.slice(-6)}` : "❌ NO DEFINIDA",
    BREVO_TEMPLATE_ID: BREVO_TEMPLATE_ID || "❌ NO DEFINIDO",
  });

  try {
    // 2. Consultas a DB
    log("info", "Consultando DB (Chatbot + SystemConfig)...");
    const [chatbot, bccConfig] = await Promise.all([
      Chatbot.findById(session.chatbot_id).lean(),
      SystemConfig.findOne({ key: "bcc_email" }).lean(),
    ]);

    if (!chatbot) {
      log("warn", `Chatbot no encontrado: ${session.chatbot_id}`);
      return;
    }
    log("debug", "Chatbot encontrado", { id: chatbot._id, name: chatbot.name });

    // 3. Destinatarios
    const bccEmail = bccConfig?.value?.trim() || process.env.BCC_EMAIL || "";
    const emailSettings = chatbot.email_settings || {};
    const toEmailRaw = emailSettings.enabled ? emailSettings.to_email : null;

    const toEmails = Array.isArray(toEmailRaw)
      ? toEmailRaw.filter((e) => e?.trim())
      : typeof toEmailRaw === "string" && toEmailRaw.trim()
        ? toEmailRaw.split(",").map((e) => e.trim()).filter(Boolean)
        : [];

    log("debug", "Destinatarios resueltos", {
      emailSettings_enabled: emailSettings.enabled,
      toEmails,
      bccEmail: bccEmail || "(vacío)",
    });

    if (toEmails.length === 0 && !bccEmail) {
      log("warn", "Sin destinatarios — se omite el envío");
      return;
    }

    // 4. Variables del contacto
    const vars = session.variables || {};
    log("debug", "Variables de sesión", {
      name: vars.name || null,
      email: vars.email || null,
      phone: vars.phone || null,
    });

    if (!vars.name && !vars.email && !vars.phone && toEmails.length === 0) {
      log("warn", "Sin variables de contacto ni destinatarios directos — se omite");
      return;
    }

    // 5. Construir payload
    const params = buildTemplateParams({ chatbot, emailSettings, session, vars });
    const to = toEmails.length > 0
      ? toEmails.map((e) => ({ email: e }))
      : [{ email: bccEmail }];
    const bcc = bccEmail && toEmails.length > 0 ? [{ email: bccEmail }] : undefined;

    const payload = {
      to,
      ...(bcc && { bcc }),
      templateId: BREVO_TEMPLATE_ID,
      params,
    };

    log("debug", "Payload que se enviará a Brevo", {
      to: payload.to,
      bcc: payload.bcc,
      templateId: payload.templateId,
      params: {
        ...payload.params,
        mensaje: payload.params.mensaje?.slice(0, 100) + "…", // recortar para el log
      },
    });

    // 6. Enviar
    await sendWithRetry(payload);

  } catch (err) {
    log("error", `Falla definitiva al enviar email para session ${session._id}`, {
      code: err.code,
      message: err.message,
      brevoResponse: err.response?.data || null,
    });
  }
};

// ─── Builder de parámetros (sin cambios) ────────────────────────────────────
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
    nombre, email, telefono, fecha, origen,
    whatsappLink, phoneLink, emailLink,
    mensaje: mensaje || "Sin conversación registrada.",
  };
}