// chatbotIntegration.controller.js

const Chatbot = require("../models/Chatbot");
const crypto = require("crypto");

const isDomainAllowed = require("../helper/isDomainAllowed");
const { normalizeDomain } = require("../utils/normalizeDomain");
const { isLocalhost } = require("../utils/isLocalhost");
const { domainExists } = require("../validators/domain.validator");

const getBaseUrl = () =>
  process.env.APP_BASE_URL || "https://backend-chatbot-omega.vercel.app";

const getWidgetBaseUrl = () =>
  process.env.WIDGET_BASE_URL ||
  "https://chatbot-widget-blue-eight.vercel.app";

const CONFIG_SECRET = process.env.CONFIG_SECRET;

const WIDGET_BASE_URL = getWidgetBaseUrl();
const WIDGET_DOMAIN = normalizeDomain(WIDGET_BASE_URL);

/* =======================================================
   HELPERS
======================================================= */

function getRequestDomain(req) {

  const raw =
    req.headers.origin ||
    req.headers.referer ||
    "";

  return normalizeDomain(raw);
}

function signDomain(domain, ts) {

  return crypto
    .createHmac("sha256", CONFIG_SECRET)
    .update(domain + ":" + ts)
    .digest("hex");
}

function verifyDomainSignature(domain, ts, sig) {

  const expected = signDomain(domain, ts);

  if (sig.length !== expected.length) return false;

  return crypto.timingSafeEqual(
    Buffer.from(sig),
    Buffer.from(expected)
  );
}

/* =======================================================
   1) INSTALL SCRIPT
======================================================= */

exports.getInstallScript = async (req, res) => {

  try {

    const { public_id } = req.params;
    const token = req.query.t;

    const chatbot = await Chatbot.findOne({
      public_id,
      status: "active",
      is_enabled: true
    }).lean();

    if (!chatbot) {
      return res.status(404).send("// Chatbot no encontrado");
    }

    if (!token || token !== chatbot.install_token) {
      return res.status(403).send("// Token inválido");
    }

    const domain = getRequestDomain(req);

    if (!domain) {
      return res.status(403).send("// Dominio no detectable");
    }

    if (!isDomainAllowed(chatbot, domain)) {
      return res.status(403).send("// Dominio no autorizado");
    }

    const ts = Date.now();

    const sig = signDomain(domain, ts);

    const baseUrl = getBaseUrl();

    res.type("application/javascript");

    res.setHeader("Cache-Control", "no-store");

    res.send(`(function(){

  if (window.__CHATBOT_INSTALLED__) return;
  window.__CHATBOT_INSTALLED__ = true;

  var iframe = document.createElement("iframe");

  iframe.src =
  "${baseUrl}/api/chatbot-integration/embed/${public_id}?d=${encodeURIComponent(domain)}&ts=${ts}&sig=${sig}";

  iframe.style.cssText = [
    "position:fixed",
    "bottom:0",
    "right:0",
    "width:80px",
    "height:80px",
    "border:none",
    "z-index:2147483647",
    "background:transparent",
    "border-radius:50%"
  ].join(";");

  iframe.sandbox =
  "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox";

  document.body.appendChild(iframe);

})();`);

  } catch (err) {

    console.error("INSTALL SCRIPT ERROR:", err);

    res.status(500).send("// Error interno");

  }
};


/* =======================================================
   2) EMBED HTML
======================================================= */

exports.renderEmbed = async (req, res) => {

  try {

    const { public_id } = req.params;

    const domain = normalizeDomain(req.query.d);
    const ts = parseInt(req.query.ts);
    const sig = req.query.sig;

    if (!domain || !ts || !sig) {
      return res.status(400).send("Parámetros inválidos");
    }

    const realDomain = getRequestDomain(req);

    if (!realDomain) {
      return res.status(403).send("Dominio no detectable");
    }

    /* ===== VALIDAR DOMINIO REAL ===== */

    if (realDomain !== domain) {
      return res.status(403).send("Dominio manipulado");
    }

    /* ===== VALIDAR FIRMA ===== */

    if (!verifyDomainSignature(domain, ts, sig)) {
      return res.status(403).send("Firma inválida");
    }

    /* ===== ANTI REPLAY ===== */

    const MAX_AGE = 5 * 60 * 1000;

    if (Date.now() - ts > MAX_AGE) {
      return res.status(403).send("Script expirado");
    }

    const chatbot = await Chatbot.findOne({
      public_id,
      status: "active",
      is_enabled: true
    }).lean();

    if (!chatbot) {
      return res.status(404).send("Chatbot no encontrado");
    }

    if (!isDomainAllowed(chatbot, domain)) {
      return res.status(403).send("Dominio no permitido");
    }

    const config = {
      ts: Date.now(),
      apiBase: getBaseUrl(),
      publicId: public_id,
      originDomain: domain,
      name: chatbot.name,
      avatar: chatbot.avatar || "",
      primaryColor: chatbot.primary_color || "#2563eb",
      secondaryColor: chatbot.secondary_color || "#111827",
      inputPlaceholder: chatbot.input_placeholder || "Escribe tu mensaje...",
      welcomeMessage: chatbot.welcome_message || "",
      welcomeDelay: chatbot.welcome_delay ?? 2
    };

    const payload = JSON.stringify(config);

    const signature = crypto
      .createHmac("sha256", CONFIG_SECRET)
      .update(payload)
      .digest("hex");

    const encoded = encodeURIComponent(
      Buffer.from(JSON.stringify({ payload, signature })).toString("base64")
    );

    const widgetUrl = `${WIDGET_BASE_URL}/?config=${encoded}`;

    res.setHeader(
      "Content-Security-Policy",
      `frame-ancestors https://${domain}`
    );

    res.setHeader("Cache-Control", "no-store");

    return res.redirect(widgetUrl);

  } catch (err) {

    console.error("RENDER EMBED ERROR:", err);

    return res.status(500).send("No se pudo cargar el chatbot");

  }
};

/* =======================================================
   4) AGREGAR DOMINIO
======================================================= */
exports.addAllowedDomain = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "No autorizado" });
    }

    const { public_id } = req.params;
    const normalized = normalizeDomain(req.body.domain);

    if (!normalized) {
      return res.status(400).json({ error: "Dominio inválido" });
    }

    const normalizedLower = normalized.toLowerCase();
    const isDev = process.env.NODE_ENV !== "production";

    // Validación localhost
    if (isLocalhost(normalizedLower)) {
      if (!isDev) {
        return res.status(400).json({
          error: "Dominios localhost no permitidos en producción"
        });
      }
    } else {
      const exists = await domainExists(normalizedLower);
      if (!exists) {
        return res.status(400).json({
          error: "El dominio no existe en DNS"
        });
      }
    }

    // 🔥 Query dinámico según rol
    const query = { public_id };

    if (req.user.role !== "ADMIN") {
      if (!req.user.account_id) {
        return res.status(401).json({ error: "Cuenta inválida" });
      }
      query.account_id = req.user.account_id;
    }

    const chatbot = await Chatbot.findOne(query);

    if (!chatbot) {
      return res.status(404).json({ error: "Chatbot no encontrado" });
    }

    // 🔐 Prevención real de duplicados (case-insensitive)
    const alreadyExists = chatbot.allowed_domains.some(
      d => d.toLowerCase() === normalizedLower
    );

    if (alreadyExists) {
      return res.status(400).json({ error: "Dominio ya existe" });
    }

    // Agregar dominio
    chatbot.allowed_domains.push(normalizedLower);

    // 🛡️ Limpieza defensiva anti-duplicados
    chatbot.allowed_domains = [
      ...new Set(chatbot.allowed_domains.map(d => d.toLowerCase()))
    ];

    await chatbot.save();

    res.json({
      success: true,
      domains: chatbot.allowed_domains
    });

  } catch (err) {
    console.error("ADD DOMAIN:", err);
    res.status(500).json({ error: "Error interno" });
  }
};

/* =======================================================
   5) ELIMINAR DOMINIO
======================================================= */
exports.removeAllowedDomain = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "No autorizado" });
    }

    const { public_id } = req.params;
    const domain = normalizeDomain(req.body.domain);

    const query = { public_id };

    if (req.user.role !== "ADMIN") {
      if (!req.user.account_id) {
        return res.status(401).json({ error: "Cuenta inválida" });
      }
      query.account_id = req.user.account_id;
    }

    const chatbot = await Chatbot.findOne(query);

    if (!chatbot) {
      return res.status(404).json({ error: "Chatbot no encontrado" });
    }

    chatbot.allowed_domains = chatbot.allowed_domains.filter(
      d => d !== domain
    );

    await chatbot.save();

    res.json({ success: true, domains: chatbot.allowed_domains });

  } catch (err) {
    console.error("REMOVE DOMAIN:", err);
    res.status(500).json({ error: "Error interno" });
  }
};

/* =======================================================
   6) GENERAR CÓDIGO DE INSTALACIÓN
======================================================= */

exports.InstallationCode = async (req, res) => {
  try {
    const { public_id } = req.params;

    const chatbot = await Chatbot.findOne({ public_id });

    if (!chatbot) {
      return res.status(404).json({ error: "Chatbot no encontrado" });
    }

    const baseUrl = getBaseUrl();

    const script = `<script src="${baseUrl}/api/chatbot-integration/${public_id}/install?t=${chatbot.install_token}" async></script>`;

    res.json({
      script,
      install_token: chatbot.install_token,
      allowed_domains: chatbot.allowed_domains || [],
      has_domains: chatbot.allowed_domains.length > 0
    });

  } catch (err) {
    console.error("INSTALL CODE ERROR:", err);
    res.status(500).json({ error: "Error interno" });
  }
};

/* =======================================================
   7) REGENERAR TOKEN DE INSTALACIÓN
======================================================= */
exports.regenerateInstallToken = async (req, res) => {
  try {
    if (!req.user?.account_id) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const { public_id } = req.params;

    const chatbot = await Chatbot.findOne({
      public_id,
      account_id: req.user.account_id
    });

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    chatbot.install_token = crypto.randomBytes(32).toString("hex");
    chatbot.allowed_domains = [];
    chatbot.installation_status = "pending";

    await chatbot.save();

    res.json({
      message: "Token regenerado correctamente",
      install_token: chatbot.install_token
    });

  } catch (err) {
    console.error("REGENERATE TOKEN ERROR:", err);
    res.status(500).json({ message: "Error al regenerar token" });
  }
};

exports.verifyConfigSignature = async (req, res) => {
  try {
    const { payload, signature } = req.body;

    if (!payload || !signature) {
      return res.status(400).json({ error: "Datos incompletos" });
    }

    if (!process.env.CONFIG_SECRET) {
      return res.status(500).json({ error: "Server misconfig" });
    }

    const expected = crypto
      .createHmac("sha256", process.env.CONFIG_SECRET)
      .update(payload)
      .digest("hex");

    if (signature.length !== expected.length) {
      return res.status(403).json({ error: "Firma inválida" });
    }

    const valid = crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expected, "hex")
    );
    if (!valid) {
      return res.status(403).json({ error: "Firma inválida" });
    }

    const config = JSON.parse(payload);

    // ⏱️ Anti-replay
    const MAX_AGE_MS = 5 * 60 * 1000;
    if (!config.ts || Date.now() - config.ts > MAX_AGE_MS) {
      return res.status(403).json({ error: "Config expirada" });
    }

    res.json(config);

  } catch (err) {
    console.error("VERIFY SIGNATURE:", err);
    res.status(500).json({ error: "Error interno" });
  }
};

module.exports = exports;
