//chatbotIntegration.controller
const Chatbot = require("../models/Chatbot");
const crypto = require("crypto");
const { parseOrigin } = require("../utils/origin.utils");
const { isLocalhost } = require("../utils/domainValidation");
const { domainMatches } = require("../utils/domainMatch");
const { normalizeDomain } = require("../utils/domain.utils");
const { domainExists } = require("../utils/domain.validator");


//UTILIDADES
const escapeHTML = (str = "") =>
  str.replace(/[&<>"']/g, m =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[m]
  );

const getBaseUrl = () =>
  process.env.APP_BASE_URL || "https://backend-chatbot-omega.vercel.app";

//Extraer dominio y puerto desde Origin
exports.serveWidget = async (req, res) => {
  const originHeader = req.headers.origin;
  const parsed = parseOrigin(originHeader);

  if (!parsed) {
    return res.status(403).json({ error: "Origen inválido" });
  }

  const { hostname, port } = parsed;
  const originDomain = normalizeDomain(hostname);

  if (!originDomain) {
    return res.status(403).json({ error: "Dominio inválido" });
  }

  const chatbot = await Chatbot.findOne({ public_id: req.params.id });

  if (!chatbot) {
    return res.status(404).json({ error: "Chatbot no encontrado" });
  }

  const domainAllowed = chatbot.allowed_domains.some(a =>
    domainMatches(originDomain, a)
  );

  if (!domainAllowed) {
    return res.status(403).json({ error: "Dominio no permitido" });
  }

  // 🔐 Validar puerto SOLO en localhost
  if (isLocalhost(originDomain)) {
    const ALLOWED_PORTS = ["3000", "5173"];

    if (port && !ALLOWED_PORTS.includes(port)) {
      return res.status(403).json({
        error: "Puerto no permitido"
      });
    }
  }

  res.json({ ok: true });
};

/* =======================================================
   1) GET INSTALL SCRIPT  → /:public_id/install
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

    // 🔐 VALIDAR TOKEN
    if (!token || token !== chatbot.install_token) {
      return res.status(403).send("// Token inválido");
    }

    const rawOrigin =
      req.headers.origin ||
      req.headers.referer ||
      "";

    const domain = normalizeDomain(rawOrigin);

    if (!domain) {
      return res.status(403).send("// Dominio no detectable");
    }

    const allowed =
      chatbot.allowed_domains.some(d => domainMatches(domain, d)) ||
      (process.env.NODE_ENV === "development" && isLocalhost(domain));

    if (!allowed) {
      return res.status(403).send("// Dominio no autorizado");
    }

    const baseUrl = getBaseUrl();
    const safeDomain = encodeURIComponent(domain);

    res.type("application/javascript");
    res.setHeader("Cache-Control", "no-store");

    res.send(`(function(){
  if (window.__CHATBOT_INSTALLED__) return;
  window.__CHATBOT_INSTALLED__ = true;

  var iframe = document.createElement("iframe");

  iframe.src = "${baseUrl}/api/chatbot-integration/embed/${public_id}?d=${safeDomain}";

  iframe.style.cssText = [
    "position:fixed",
    "bottom:20px",
    "right:20px",
    "width:380px",
    "height:600px",
    "border:none",
    "border-radius:12px",
    "z-index:2147483647",
    "background:transparent"
  ].join(";");

  iframe.sandbox = "allow-scripts allow-same-origin allow-forms allow-modals";
  iframe.setAttribute("allow", "clipboard-write");

  document.body.appendChild(iframe);
})();`);

  } catch (err) {
    console.error("INSTALL SCRIPT ERROR:", err);
    res.status(500).send("// Error interno");
  }
};

/* =======================================================
   3) RENDER EMBED (HTML)
======================================================= */
exports.renderEmbed = async (req, res) => {
  try {
    const { public_id } = req.params;
    const domain = normalizeDomain(req.query.d || "");

    if (!domain) {
      return res.status(400).send("Dominio inválido");
    }

    const chatbot = await Chatbot.findOne({
      public_id,
      status: "active",
      is_enabled: true
    }).lean();

    if (!chatbot) {
      return res.status(404).send("Chatbot no encontrado");
    }

    const isDev = process.env.NODE_ENV === "development";

    const allowed =
      chatbot.allowed_domains.some(d => domainMatches(domain, d)) ||
      (isDev && isLocalhost(domain));

    if (!allowed) {
      return res.status(403).send("Dominio no permitido");
    }

    const apiOrigin = new URL(getBaseUrl()).origin;

    const stripProtocol = d =>
      d.replace(/^https?:\/\//, "").replace(/\/$/, "");

    /* =========================
       ✅ FRAME-ANCESTORS FIX
    ========================= */

    const ancestors = new Set();

    // 1️⃣ Dominios permitidos en DB
    chatbot.allowed_domains.forEach(d => {
      if (isLocalhost(d)) {
        ancestors.add("http://localhost:*");
        ancestors.add("http://127.0.0.1:*");
        ancestors.add("https://localhost:*");
      } else {
        const clean = stripProtocol(d);
        ancestors.add(`https://${clean}`);
        ancestors.add(`https://*.${clean}`);
      }
    });

    // 2️⃣ FORZAR localhost en desarrollo
    if (isDev) {
      ancestors.add("http://localhost:*");
      ancestors.add("http://127.0.0.1:*");
    }

    const frameAncestors =
      ancestors.size > 0 ? Array.from(ancestors).join(" ") : "'none'";

    /* =========================
       CONFIG SEGURA
    ========================= */

    const safeConfig = {
      apiBase: getBaseUrl(),
      publicId: public_id,
      name: chatbot.name,
      avatar: chatbot.avatar || "",
      primaryColor: chatbot.primary_color || "#2563eb",
      secondaryColor: chatbot.secondary_color || "#111827",
      inputPlaceholder: chatbot.input_placeholder || "Escribe tu mensaje…",
      welcomeMessage: chatbot.welcome_message || ""
    };

    /* =========================
       HEADERS SEGUROS
    ========================= */

    res.setHeader(
      "Content-Security-Policy",
      [
        `default-src 'self'`,
        `script-src 'self' ${apiOrigin}`,
        `style-src 'self' 'unsafe-inline'`,
        `img-src 'self' data: https:`,
        `connect-src 'self' ${apiOrigin} wss:`,
        `frame-ancestors ${frameAncestors}`
      ].join("; ")
    );

    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin");
    res.setHeader(
      "Permissions-Policy",
      "geolocation=(), microphone=(), camera=()"
    );

    /* =========================
       HTML SIN INLINE SCRIPT
    ========================= */

    res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHTML(chatbot.name)}</title>
<link rel="stylesheet" href="/public/chatbot/embed.css" />
</head>
<body>

<button class="chat-fab" id="chatToggle">
  <img id="chatAvatarFab" class="chat-avatar-fab" alt="Avatar" />
</button>

<div class="chat-welcome" id="chatWelcome">
  <span class="welcome-text"></span>
</div>

<div class="chat-widget" id="chatWidget">
  <div class="chat">
    <header class="chat-header">
      <img id="chatAvatarHeader" class="chat-avatar" alt="Avatar" />
      <div class="chat-header-info">
        <strong id="chatName">${escapeHTML(chatbot.name)}</strong>
        <div class="chat-status" id="chatStatus">Offline</div>
      </div>
      <div class="chat-actions">
        <button id="chatRestart" class="chat-restart" aria-label="Reiniciar conversación">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M1 4v6h6M23 20v-6h-6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button class="chat-close" id="chatClose" aria-label="Cerrar">×</button>
      </div>
    </header>

    <main id="messages"></main>

    <footer>
      <input id="messageInput" autocomplete="off" />
      <button id="sendBtn" aria-label="Enviar mensaje">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M22 2L11 13" stroke="white" stroke-width="2"/>
          <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="white" stroke-width="2"/>
        </svg>
      </button>
    </footer>
  </div>
</div>

<script
  src="/public/chatbot/embed.js"
  data-config='${escapeHTML(JSON.stringify(safeConfig))}'
></script>

</body>
</html>`);
  } catch (err) {
    console.error("RENDER EMBED ERROR:", err);
    res.status(500).send("No se pudo cargar el chatbot");
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

    const isDev = process.env.NODE_ENV !== "production";

    if (isLocalhost(normalized)) {
      if (!isDev) {
        return res.status(400).json({
          error: "Dominios localhost no permitidos en producción"
        });
      }
    } else {
      const exists = await domainExists(normalized);
      if (!exists) {
        return res.status(400).json({
          error: "El dominio no existe en DNS"
        });
      }
    }

    // 🔥 QUERY DINÁMICO SEGÚN ROL
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

    if (chatbot.allowed_domains.includes(normalized)) {
      return res.status(400).json({ error: "Dominio ya existe" });
    }

    chatbot.allowed_domains.push(normalized);
    await chatbot.save();

    res.json({ success: true, domains: chatbot.allowed_domains });

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

module.exports = exports;
