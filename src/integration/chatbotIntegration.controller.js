const Chatbot = require("../models/Chatbot");
const crypto = require("crypto");
const { signDomain } = require("../utils/domainSignature");
const { isLocalhost } = require("../utils/domainValidation");
const { domainMatches } = require("../utils/domainMatch");
const isValidDomain = require("../utils/isValidDomain");

/* =======================================================
   UTILIDADES
======================================================= */

const normalizeDomain = (input = "") => {
  try {
    if (!input) return "";

    input = input.trim().toLowerCase();

    if (input.startsWith("*.")) {
      let base = input.slice(2);
      if (!/^https?:\/\//.test(base)) {
        base = "https://" + base;
      }
      const url = new URL(base);
      return "*." + url.hostname.replace(/^www\./, "");
    }

    if (!/^https?:\/\//.test(input)) {
      input = "https://" + input;
    }

    const url = new URL(input);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

const escape = (str = "") =>
  str.replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[m]);

const getBaseUrl = () =>
  process.env.APP_BASE_URL ||
  "https://backend-chatbot-omega.vercel.app";

const safeCompare = (a, b) => {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

/* =======================================================
   1) GET INSTALL SCRIPT  → /:public_id/install
======================================================= */
exports.getInstallScript = async (req, res) => {
  try {
    const { public_id } = req.params;

    const chatbot = await Chatbot.findOne({
      public_id,
      status: "active",
      is_enabled: true
    });

    if (!chatbot) {
      return res.status(404).send("// Chatbot no encontrado");
    }

    let origin = req.headers.origin || "";
    if (!origin && req.headers.referer) {
      try {
        origin = new URL(req.headers.referer).origin;
      } catch {
        origin = "";
      }
    }

    const domain = normalizeDomain(origin);

    if (!domain) {
      return res.status(400).send("// Dominio inválido");
    }

    const allowLocalhost = process.env.NODE_ENV === "development";
    const allowedDomains = chatbot.allowed_domains || [];

    const allowed =
      allowedDomains.some(d => domainMatches(domain, d)) ||
      (allowLocalhost && isLocalhost(domain));

    if (!allowed) {
      return res.status(403).send("// Dominio no autorizado");
    }

    const timeWindow = Math.floor(Date.now() / 60000);

    const signature = signDomain(
      domain,
      chatbot.public_id,
      chatbot.install_token,
      timeWindow
    );

    const baseUrl = getBaseUrl();
    const safeDomain = encodeURIComponent(domain);

    res.type("application/javascript");
    res.setHeader("Cache-Control", "no-store");

    res.send(`(function(){
  if (window.__CHATBOT_INSTALLED__) return;
  window.__CHATBOT_INSTALLED__ = true;

  const iframe = document.createElement("iframe");

  iframe.src =
    "${baseUrl}/api/chatbot-integration/integration/${public_id}"
    + "?d=${safeDomain}"
    + "&t=${chatbot.install_token}"
    + "&w=${timeWindow}"
    + "&s=" + encodeURIComponent("${signature}");

  iframe.style.cssText = \`
    position:fixed;
    bottom:20px;
    right:20px;
    width:380px;
    height:600px;
    border:none;
    z-index:999999;
  \`;

  iframe.sandbox = "allow-scripts allow-same-origin allow-forms";
  iframe.allow = "clipboard-write";

  document.body.appendChild(iframe);
})();`);
  } catch (err) {
    console.error("INSTALL SCRIPT:", err);
    res.status(500).send("// Error interno");
  }
};

/* =======================================================
   2) INTEGRATION SCRIPT
======================================================= */
exports.integrationScript = async (req, res) => {
  try {
    const { public_id } = req.params;
    const { d, t, w, s } = req.query;

    if (!d || !t || !w || !s) {
      return res.status(400).send("// Parámetros inválidos");
    }

    const domain = normalizeDomain(d);
    const timeWindow = parseInt(w, 10);

    if (!domain || Number.isNaN(timeWindow)) {
      return res.status(400).send("// Parámetros inválidos");
    }

    const now = Math.floor(Date.now() / 60000);
    const WINDOW = process.env.NODE_ENV === "development" ? 5 : 2;

    if (Math.abs(now - timeWindow) > WINDOW) {
      return res.status(403).send("// Firma expirada");
    }

    const chatbot = await Chatbot.findOne({
      public_id,
      install_token: t,
      status: "active",
      is_enabled: true
    }).lean();

    if (!chatbot) {
      return res.status(403).send("// Chatbot inválido");
    }

    const allowLocalhost = process.env.NODE_ENV === "development";
    const allowedDomains = chatbot.allowed_domains || [];

    const allowed =
      allowedDomains.some(d => domainMatches(domain, d)) ||
      (allowLocalhost && isLocalhost(domain));

    if (!allowed) {
      return res.status(403).send("// Dominio no autorizado");
    }

    let valid = false;

    for (let i = -WINDOW; i <= WINDOW; i++) {
      const expected = signDomain(
        domain,
        chatbot.public_id,
        chatbot.install_token,
        timeWindow + i
      );

      if (safeCompare(expected, s)) {
        valid = true;
        break;
      }
    }

    if (!valid) {
      return res.status(403).send("// Firma inválida");
    }

    const baseUrl = getBaseUrl();
    const safeDomain = encodeURIComponent(domain);

    res.type("application/javascript");
    res.setHeader("Cache-Control", "no-store");

    res.send(`(function(){
  var iframe = document.createElement("iframe");

  iframe.src =
    "${baseUrl}/api/chatbot-integration/embed/${public_id}?d=${safeDomain}";

  iframe.style.cssText = \`
    position:fixed;
    bottom:20px;
    right:20px;
    width:380px;
    height:600px;
    border:none;
    z-index:999999;
  \`;

  iframe.sandbox = "allow-scripts allow-same-origin allow-forms";
  iframe.allow = "clipboard-write";

  document.body.appendChild(iframe);
})();`);
  } catch (err) {
    console.error("INTEGRATION SCRIPT:", err);
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

    const allowLocalhost = process.env.NODE_ENV === "development";
    const allowedDomains = chatbot.allowed_domains || [];

    const allowed =
      allowedDomains.some(d => domainMatches(domain, d)) ||
      (allowLocalhost && isLocalhost(domain));

    if (!allowed) {
      return res.status(403).send("Dominio no permitido");
    }

    const apiOrigin = new URL(getBaseUrl()).origin;

    const frameAncestors = allowedDomains.length
      ? allowedDomains
          .map(d =>
            d.startsWith("*.") 
              ? `https://*.${d.slice(2)} http://*.${d.slice(2)}`
              : `https://${d} http://${d}`
          )
          .join(" ")
      : apiOrigin;

    res.setHeader(
      "Content-Security-Policy",
      `default-src 'self';
       frame-src ${apiOrigin};
       connect-src 'self' ${apiOrigin};
       frame-ancestors ${frameAncestors};`
        .replace(/\s+/g, " ")
        .trim()
    );

    res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>${escape(chatbot.name)}</title>
  <link rel="stylesheet" href="/public/chatbot/embed.css" />
</head>
<body>

<button class="chat-fab" id="chatToggle">💬</button>

<div class="chat-widget" id="chatWidget">
  <div class="chat">
    <header class="chat-header">
      <strong>${escape(chatbot.name)}</strong>
    </header>

    <main id="messages"></main>

    <footer>
      <input id="messageInput" placeholder="Escribe tu mensaje…" />
      <button id="sendBtn">Enviar</button>
    </footer>
  </div>
</div>

<script>
window.__CHATBOT_CONFIG__ = {
  apiBase: ${JSON.stringify(getBaseUrl())},
  publicId: ${JSON.stringify(public_id)},
  name: ${JSON.stringify(chatbot.name)},
  avatar: ${JSON.stringify(chatbot.avatar || "")},
  primaryColor: ${JSON.stringify(chatbot.primary_color || "#2563eb")},
  secondaryColor: ${JSON.stringify(chatbot.secondary_color || "#111827")}
};
</script>

<script src="/public/chatbot/embed.js" defer></script>
</body>
</html>
`);
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
    if (!req.user?.account_id) {
      return res.status(401).json({ error: "No autorizado" });
    }

    const { chatbotId } = req.params;
    let { domain } = req.body;

    domain = normalizeDomain(domain);

    if (!domain || !isValidDomain(domain)) {
      return res.status(400).json({ error: "Dominio inválido" });
    }

    const chatbot = await Chatbot.findById(chatbotId);

    if (!chatbot) {
      return res.status(404).json({ error: "No encontrado" });
    }

    if (chatbot.account_id.toString() !== req.user.account_id) {
      return res.status(403).json({ error: "Sin permisos" });
    }

    chatbot.allowed_domains ||= [];

    const exists = chatbot.allowed_domains.some(d =>
      d === domain || domainMatches(domain, d)
    );

    if (exists) {
      return res.status(409).json({ error: "Dominio ya existe" });
    }

    chatbot.allowed_domains.push(domain);
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
    if (!req.user?.account_id) {
      return res.status(401).json({ error: "No autorizado" });
    }

    const { chatbotId } = req.params;
    let { domain } = req.body;

    domain = normalizeDomain(domain);

    if (!domain) {
      return res.status(400).json({ error: "Dominio inválido" });
    }

    const chatbot = await Chatbot.findById(chatbotId);

    if (!chatbot) {
      return res.status(404).json({ error: "No encontrado" });
    }

    if (chatbot.account_id.toString() !== req.user.account_id) {
      return res.status(403).json({ error: "Sin permisos" });
    }

    const before = chatbot.allowed_domains.length;

    chatbot.allowed_domains = chatbot.allowed_domains.filter(d => {
      if (d === domain) return false;

      if (d.startsWith("*.")) {
        const base = d.slice(2);
        return !domain.endsWith("." + base);
      }

      return true;
    });

    if (before === chatbot.allowed_domains.length) {
      return res.status(404).json({ error: "Dominio no encontrado" });
    }

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
exports.sendInstallationCode = async (req, res) => {
  try {
    const { chatbotId } = req.params;
    const chatbot = await Chatbot.findById(chatbotId);
    if (!chatbot) {
      return res.status(404).json({ error: "Chatbot no encontrado" });
    }
    if (chatbot.account_id.toString() !== req.user.account_id) {
      return res.status(403).json({ error: "Sin permisos" });
    }
    chatbot.install_token = crypto.randomBytes(32).toString("hex");
    await chatbot.save();
    const baseUrl = getBaseUrl();
    const script = `<script src="${baseUrl}/api/chatbot-integration/${chatbot.public_id}/install" async></script>`;
    res.json({ script });
  } catch (err) {
    console.error("INSTALL CODE ERROR:", err);
    res.status(500).json({ error: "Error interno" });
  }
};

module.exports = exports;
