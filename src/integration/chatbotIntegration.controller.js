///chatbotIntegration.controller.js
const Chatbot = require("../models/Chatbot");
const sendChatbotInstallEmail = require("../services/sendChatbotInstallEmail.service");
const { signDomain } = require("../utils/domainSignature");
const { isLocalhost } = require("../utils/domainValidation")
const { domainMatches } = require("../utils/domainMatch");
const crypto = require("crypto");
/**
 * Extrae el dominio desde los headers de la petición
 */
const normalizeDomain = domain =>
  domain
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .replace(/:\d+$/, "")
    .replace(/^www\./, "")
    .toLowerCase();

const findChatbotByPublicId = (public_id, account_id) => {
  return Chatbot.findOne({
    public_id,
    account_id,
    status: "active"
  });
};

// ═══════════════════════════════════════════════════════════
// MIDDLEWARE DE VALIDACIÓN DE DOMINIO
// ═══════════════════════════════════════════════════════════
const validateDomainMiddleware = async (req, res, next) => {
  try {
    const origin = req.headers.origin || req.headers.referer;
    if (!origin) {
      return res.status(403).json({ message: "Origen no permitido" });
    }

    const normalizedOrigin = normalizeDomain(origin);
    const { public_id } = req.params;

    const chatbot = await Chatbot.findOne({
      public_id,
      status: "active",
      is_enabled: true
    }).lean();

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    const allowed =
      chatbot.allowed_domains.some(d =>
        domainMatches(normalizedOrigin, d)
      ) || isLocalhost(normalizedOrigin);

    if (!allowed) {
      return res.status(403).json({
        message: "Dominio no autorizado",
        domain: normalizedOrigin
      });
    }

    req.chatbot = chatbot;
    next();
  } catch (error) {
    console.error("VALIDATE DOMAIN ERROR:", error);
    res.status(500).json({ message: "Error de validación" });
  }
};


// ═══════════════════════════════════════════════════════════
// OBTENER SCRIPT DE INSTALACIÓN
// ═══════════════════════════════════════════════════════════
exports.getInstallScript = async (req, res) => {
  try {
    if (!req.user?.account_id) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const chatbot = await findChatbotByPublicId(
      req.params.public_id,
      req.user.account_id
    );

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    if (!chatbot.allowed_domains?.length) {
      return res.status(400).json({
        message: "Agrega al menos un dominio permitido antes de instalar"
      });
    }

    const domain = chatbot.allowed_domains[0];

    const baseUrl =
      process.env.NODE_ENV === "development"
        ? "http://localhost:3000"
        : "https://api.tudominio.com";

    const script = `<script src="${baseUrl}/api/chatbot-integration/chatbot/${chatbot.public_id}.js" data-domain="${domain}" data-token="${chatbot.install_token}" async></script>`;

    res.setHeader('Content-Type', 'text/plain');
    res.send(script);

  } catch (error) {
    console.error("GET INSTALL SCRIPT ERROR:", error);
    res.status(500).json({ message: "Error generando script" });
  }
};

// ═══════════════════════════════════════════════════════════
// GENERAR FIRMA PARA DOMINIO (endpoint auxiliar)
// ═══════════════════════════════════════════════════════════
exports.generateDomainSignature = async (req, res) => {
  try {
    const { public_id, domain, token } = req.query;

    if (!public_id || !domain || !token) {
      return res.status(400).json({ message: "Parámetros faltantes" });
    }

    const chatbot = await Chatbot.findOne({
      public_id,
      install_token: token,
      status: "active"
    }).lean();

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    const normalizedDomain = normalizeDomain(domain);
    const timeWindow = Math.floor(Date.now() / 60000);

    const signature = signDomain(
      normalizedDomain,
      chatbot.public_id,
      chatbot.install_token,
      timeWindow
    );

    res.json({ signature, timeWindow });

  } catch (error) {
    console.error("GENERATE SIGNATURE ERROR:", error);
    res.status(500).json({ message: "Error generando firma" });
  }
};

// ═══════════════════════════════════════════════════════════
// NUEVO: VERIFICAR DOMINIO Y GENERAR FIRMA
// ═══════════════════════════════════════════════════════════
exports.verifyDomain = async (req, res) => {
  try {
    const { public_id, domain, token, time } = req.query;
    const origin = req.headers.origin || req.headers.referer;

    if (!origin) {
      return res.status(403).json({ message: "Origen requerido" });
    }

    if (!public_id || !domain || !token || !time) {
      return res.status(400).json({ message: "Parámetros faltantes" });
    }

    const normalizedOrigin = normalizeDomain(origin);
    const normalizedDomain = normalizeDomain(domain);

    if (
      !domainMatches(normalizedOrigin, normalizedDomain) &&
      !isLocalhost(normalizedOrigin)
    ) {
      return res.status(403).json({
        message: "Dominio no coincide con origen"
      });
    }

    const chatbot = await Chatbot.findOne({
      public_id,
      install_token: token,
      status: "active",
      is_enabled: true
    }).lean();

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    const isAllowed = chatbot.allowed_domains.some(d =>
      domainMatches(normalizedDomain, d)
    );

    if (!isAllowed && !isLocalhost(normalizedDomain)) {
      return res.status(403).json({ message: "Dominio no autorizado" });
    }

    const currentTime = Math.floor(Date.now() / 60000);
    if (Math.abs(currentTime - parseInt(time)) > 2) {
      return res.status(403).json({ message: "Firma expirada" });
    }

    const signature = signDomain(
      normalizedDomain,
      chatbot.public_id,
      chatbot.install_token,
      time
    );

    res.setHeader("Access-Control-Allow-Origin", origin);

    res.json({
      verified: true,
      signature,
      timeWindow: time
    });

  } catch (error) {
    console.error("VERIFY DOMAIN ERROR:", error);
    res.status(500).json({ message: "Error de verificación" });
  }
};

// ═══════════════════════════════════════════════════════════
// MEJORADO: SCRIPT DE INTEGRACIÓN CON VERIFICACIÓN
// ═══════════════════════════════════════════════════════════
exports.integrationScript = async (req, res) => {
  try {
    const { public_id } = req.params;

    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("X-Content-Type-Options", "nosniff");

    const chatbot = await Chatbot.findOne({
      public_id,
      status: "active",
      is_enabled: true
    }).lean();

    if (!chatbot) {
      return res.send(`console.warn("[Chatbot] Chatbot no encontrado");`);
    }

    const embedUrl =
      process.env.NODE_ENV === "development"
        ? `http://localhost:3000/api/chatbot-integration/embed/${chatbot.public_id}`
        : `https://backend-chatbot-omega.vercel.app/api/chatbot-integration/embed/${chatbot.public_id}`;

    const originBase = embedUrl.split("/embed")[0];

    res.send(`
(function () {
  const SCRIPT_ID = "__CHATBOT_${chatbot.public_id.replace(/-/g, "_").toUpperCase()}__";
  if (window[SCRIPT_ID]) return;
  window[SCRIPT_ID] = true;

  const script = document.currentScript;
  const domain = script.getAttribute("data-domain");
  const token = script.getAttribute("data-token");

  if (!domain || !token) {
    console.warn("[Chatbot] data-domain o data-token faltante");
    return;
  }

  const normalize = d => d.replace(/^www\\./, "").toLowerCase();
  const currentDomain = normalize(window.location.hostname);
  const expectedDomain = normalize(domain);

  if (
    currentDomain !== expectedDomain &&
    !currentDomain.endsWith("." + expectedDomain) &&
    !["localhost", "127.0.0.1"].includes(currentDomain)
  ) {
    console.error("[Chatbot] ❌ Dominio no autorizado:", currentDomain);
    return;
  }

  async function generateSignature() {
    const timeWindow = Math.floor(Date.now() / 60000);
    const res = await fetch(
      "${originBase}/verify-domain?" +
      "public_id=${chatbot.public_id}" +
      "&domain=" + encodeURIComponent(currentDomain) +
      "&token=" + encodeURIComponent(token) +
      "&time=" + timeWindow
    );

    if (!res.ok) return null;
    const data = await res.json();
    return data.signature;
  }

  (async () => {
    const signature = await generateSignature();
    if (!signature) return;

    const launcher = document.createElement("div");
    launcher.style.cssText =
      "position:fixed;bottom:20px;right:20px;width:60px;height:60px;" +
      "border-radius:50%;background:${chatbot.primary_color || "#2563eb"};" +
      "cursor:pointer;z-index:2147483646";

    document.body.appendChild(launcher);

    const iframe = document.createElement("iframe");
    iframe.src =
      "${embedUrl}?sig=" + encodeURIComponent(signature) +
      "&d=" + encodeURIComponent(currentDomain);

    iframe.style.cssText =
      "display:none;position:fixed;bottom:90px;right:20px;" +
      "width:380px;height:600px;border:none;border-radius:12px;" +
      "z-index:2147483647";

    document.body.appendChild(iframe);

    launcher.onclick = () => {
      iframe.style.display =
        iframe.style.display === "none" ? "block" : "none";
    };
  })();
})();
`);
  } catch (error) {
    console.error("INTEGRATION SCRIPT ERROR:", error);
    res.send(`console.error("[Chatbot] Error interno");`);
  }
};


// ═══════════════════════════════════════════════════════════
// REGENERAR TOKEN DE INSTALACIÓN
// ═══════════════════════════════════════════════════════════
exports.regenerateInstallToken = async (req, res) => {
  try {
    if (!req.user?.account_id) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const chatbot = await findChatbotByPublicId(
      req.params.public_id,
      req.user.account_id
    );

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    chatbot.install_token = crypto.randomBytes(24).toString("hex");
    chatbot.verified_domains = [];
    chatbot.installation_status = "pending";

    await chatbot.save();

    res.json({
      message: "Token regenerado correctamente",
      install_token: chatbot.install_token
    });

  } catch (error) {
    console.error("REGENERATE TOKEN ERROR:", error);
    res.status(500).json({ message: "Error al regenerar token" });
  }
};

// ═══════════════════════════════════════════════════════════
// AGREGAR DOMINIO PERMITIDO
// ═══════════════════════════════════════════════════════════
exports.addAllowedDomain = async (req, res) => {
  try {
    if (!req.user?.account_id) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const { domain } = req.body;
    if (!domain) {
      return res.status(400).json({ message: "Dominio inválido" });
    }

    console.log("🔍 Buscando chatbot:");
    console.log("  - public_id:", req.params.public_id);
    console.log("  - account_id:", req.user.account_id);

    const chatbot = await findChatbotByPublicId(
      req.params.public_id,
      req.user.account_id
    );

    if (!chatbot) {
      const chatbotExists = await Chatbot.findOne({
        public_id: req.params.public_id,
        status: "active"
      }).lean();

      console.log("❌ Chatbot no encontrado con account_id");
      console.log("  - ¿Existe sin validar account?", !!chatbotExists);
      if (chatbotExists) {
        console.log("  - account_id del chatbot:", chatbotExists.account_id);
        console.log("  - account_id del usuario:", req.user.account_id);
      }

      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    const normalizedDomain = normalizeDomain(domain);

    if (chatbot.allowed_domains.includes(normalizedDomain)) {
      return res.status(400).json({ message: "Dominio ya agregado" });
    }

    chatbot.allowed_domains.push(normalizedDomain);
    await chatbot.save();

    res.json({
      message: "Dominio agregado correctamente",
      allowed_domains: chatbot.allowed_domains
    });

  } catch (error) {
    console.error("ADD DOMAIN ERROR:", error);
    res.status(500).json({ message: "Error al agregar dominio" });
  }
};

// ═══════════════════════════════════════════════════════════
// ELIMINAR DOMINIO PERMITIDO
// ═══════════════════════════════════════════════════════════
exports.removeAllowedDomain = async (req, res) => {
  try {
    // 🔐 Auth
    if (!req.user?.account_id) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    // 📥 Input
    const { domain } = req.body;
    if (!domain) {
      return res.status(400).json({ message: "Dominio requerido" });
    }

    const normalizedDomain = normalizeDomain(domain);

    // 🛑 Protección básica
    if (["localhost", "127.0.0.1"].includes(normalizedDomain)) {
      return res.status(400).json({
        message: "No se puede eliminar este dominio"
      });
    }

    // 🤖 Chatbot
    const chatbot = await findChatbotByPublicId(
      req.params.public_id,
      req.user.account_id
    );

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    // 🔎 Verifica existencia
    const exists = chatbot.allowed_domains.includes(normalizedDomain);

    if (!exists) {
      return res.status(404).json({
        message: "El dominio no está registrado"
      });
    }

    // 🧹 Limpieza
    chatbot.allowed_domains = chatbot.allowed_domains.filter(
      d => d !== normalizedDomain
    );

    chatbot.verified_domains = chatbot.verified_domains.filter(
      d => d !== normalizedDomain
    );

    await chatbot.save();

    // ✅ OK
    res.json({
      message: "Dominio eliminado correctamente",
      allowed_domains: chatbot.allowed_domains,
      verified_domains: chatbot.verified_domains
    });

  } catch (error) {
    console.error("REMOVE DOMAIN ERROR:", error);
    res.status(500).json({
      message: "Error al eliminar dominio"
    });
  }
};

// ═══════════════════════════════════════════════════════════
// MEJORADO: RENDER EMBED CON VALIDACIÓN DE DOMINIO
// ═══════════════════════════════════════════════════════════
exports.renderEmbed = async (req, res) => {
  try {
    const { public_id } = req.params;
    const origin = req.headers.origin || req.headers.referer;

    if (!origin) {
      return res.status(403).send("Acceso denegado");
    }

    const chatbot = await Chatbot.findOne({
      public_id,
      status: "active",
      is_enabled: true
    }).lean();

    if (!chatbot) {
      return res.status(404).send("Chatbot no encontrado");
    }

    const normalizedOrigin = normalizeDomain(origin);
    const isAllowed =
      chatbot.allowed_domains.some(d => domainMatches(normalizedOrigin, d)) ||
      isLocalhost(normalizedOrigin);

    if (!isAllowed) {
      return res.status(403).send("Dominio no autorizado");
    }

    // ✅ Variables DEFINIDAS
    const chatbotName = chatbot.name || "Asistente Virtual";
    const primaryColor = chatbot.primary_color || "#2563eb";
    const avatar = chatbot.avatar || "";
    const welcomeDelay = chatbot.welcome_delay ?? 0;

    const API_BASE =
      process.env.NODE_ENV === "development"
        ? "http://localhost:3000"
        : "https://backend-chatbot-omega.vercel.app";

    const originURL = new URL(origin).origin;

    res.setHeader("Access-Control-Allow-Origin", originURL);
    res.setHeader(
      "Content-Security-Policy",
      `frame-ancestors ${originURL}`
    );
    res.setHeader("Content-Type", "text/html; charset=utf-8");

    res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${chatbotName}</title>

<style>
body { margin:0;font-family:system-ui;background:#f9fafb; }
.chat { display:flex;flex-direction:column;height:100vh; }
.chat-header { background:${primaryColor};color:white;padding:12px 16px;display:flex;justify-content:space-between;align-items:center; }
.chat-header-left { display:flex;align-items:center;gap:10px; }
.chat-avatar { width:38px;height:38px;border-radius:50%;background:white; }
main { flex:1;padding:16px;overflow-y:auto; }
footer { display:flex;border-top:1px solid #e5e7eb; }
input { flex:1;padding:14px;border:none;outline:none; }
button { background:${primaryColor};color:white;border:none;padding:0 20px;cursor:pointer; }

.message-row { display:flex;gap:8px;margin-bottom:12px; }
.message-row.user { justify-content:flex-end; }
.message-bubble { max-width:75%;padding:10px 14px;border-radius:12px;font-size:14px; }
.message-bubble.bot { background:white;border:1px solid #e5e7eb; }
.message-bubble.user { background:${primaryColor};color:white; }
.message-avatar { width:32px;height:32px;border-radius:50%; }
.typing { opacity:0.6;font-style:italic; }
</style>
</head>

<body>
<div class="chat">
  <header class="chat-header">
    <div class="chat-header-left">
      ${avatar ? `<img src="${avatar}" class="chat-avatar" />` : ""}
      <div>
        <div style="font-weight:600;font-size:14px">${chatbotName}</div>
        <div style="font-size:11px;opacity:.8">En línea</div>
      </div>
    </div>
    <button onclick="window.parent.postMessage('chatbot:close','*')">✕</button>
  </header>

  <main id="messages"></main>

  <footer>
    <input id="messageInput" placeholder="Escribe tu mensaje…" />
    <button onclick="sendMessage()">Enviar</button>
  </footer>
</div>

<script>
const API_BASE = "${API_BASE}";
const PUBLIC_ID = "${public_id}";
const BOT_AVATAR = "${avatar}";
const WELCOME_DELAY = ${welcomeDelay};

let SESSION_ID = null;
const messages = document.getElementById("messages");
let typingEl = null;

function showTyping() {
  typingEl = document.createElement("div");
  typingEl.className = "message-row bot";
  if (BOT_AVATAR) {
    const img = document.createElement("img");
    img.src = BOT_AVATAR;
    img.className = "message-avatar";
    typingEl.appendChild(img);
  }
  const bubble = document.createElement("div");
  bubble.className = "message-bubble bot typing";
  bubble.textContent = "Escribiendo…";
  typingEl.appendChild(bubble);
  messages.appendChild(typingEl);
}

function hideTyping() {
  if (typingEl) typingEl.remove();
}

function addBotMessage(text) {
  const row = document.createElement("div");
  row.className = "message-row bot";
  if (BOT_AVATAR) {
    const img = document.createElement("img");
    img.src = BOT_AVATAR;
    img.className = "message-avatar";
    row.appendChild(img);
  }
  const bubble = document.createElement("div");
  bubble.className = "message-bubble bot";
  bubble.innerHTML = text;
  row.appendChild(bubble);
  messages.appendChild(row);
}

function addUserMessage(text) {
  const row = document.createElement("div");
  row.className = "message-row user";
  const bubble = document.createElement("div");
  bubble.className = "message-bubble user";
  bubble.textContent = text;
  row.appendChild(bubble);
  messages.appendChild(row);
}

function renderNode(node) {
  const text = node.text || node.content;
  if (!text) return;
  showTyping();
  setTimeout(() => {
    hideTyping();
    addBotMessage(text);
  }, (node.typing_time ?? WELCOME_DELAY) * 1000);
}

async function startConversation() {
  const res = await fetch(
    \`\${API_BASE}/api/public-chatbot/chatbot-conversation/\${PUBLIC_ID}/start\`,
    { method: "POST" }
  );
  const data = await res.json();
  SESSION_ID = data.session_id;
  renderNode(data);
}

async function sendMessage() {
  const input = document.getElementById("messageInput");
  const value = input.value.trim();
  if (!value) return;
  addUserMessage(value);
  input.value = "";
  const res = await fetch(
    \`\${API_BASE}/api/public-chatbot/chatbot-conversation/\${SESSION_ID}/next\`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: value })
    }
  );
  const data = await res.json();
  renderNode(data);
}

startConversation();
</script>
</body>
</html>
`);
  } catch (err) {
    console.error("RENDER EMBED ERROR:", err);
    res.status(500).send("Error al cargar el chatbot");
  }
};

// ═══════════════════════════════════════════════════════════
// ENVIAR CÓDIGO DE INSTALACIÓN POR EMAIL
// ═══════════════════════════════════════════════════════════
exports.sendInstallationCode = async (req, res) => {
  try {
    if (!req.user?.account_id) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const { email } = req.body;
    const { public_id } = req.params;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "Email inválido" });
    }

    const chatbot = await Chatbot.findOne({
      public_id,
      account_id: req.user.account_id,
      status: "active"
    });

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    if (!chatbot.allowed_domains?.length) {
      return res.status(400).json({
        message: "Configura al menos un dominio antes de enviar el código"
      });
    }

    await sendChatbotInstallEmail({
      to: email,
      chatbotName: chatbot.name,
      publicId: chatbot.public_id,
      installToken: chatbot.install_token,
      domain: chatbot.allowed_domains[0]
    });

    res.json({
      success: true,
      message: "Código de instalación enviado correctamente"
    });

  } catch (error) {
    console.error("SEND INSTALLATION CODE ERROR:", error);
    res.status(500).json({ message: "No se pudo enviar el correo" });
  }
};

// ═══════════════════════════════════════════════════════════
// EXPORTAR MIDDLEWARE PARA USO EN RUTAS
// ═══════════════════════════════════════════════════════════
exports.validateDomainMiddleware = validateDomainMiddleware;

module.exports = exports;