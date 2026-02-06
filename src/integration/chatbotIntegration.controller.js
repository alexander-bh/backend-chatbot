const Chatbot = require("../models/Chatbot");
const crypto = require("crypto");

const sendChatbotInstallEmail = require("../services/sendChatbotInstallEmail.service");
const findChatbotByPublicId = require("../services/findChatbotByPublicId.service");

const { signDomain } = require("../utils/domainSignature");
const { isLocalhost } = require("../utils/domainValidation");
const { domainMatches } = require("../utils/domainMatch");

/**
 * Normaliza dominios / origins
 */
const normalizeDomain = (domain = "") =>
  domain
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .toLowerCase();

/* ═══════════════════════════════════════════════════════════
   OBTENER SCRIPT DE INSTALACIÓN
   ═══════════════════════════════════════════════════════════ */
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

    const domain = normalizeDomain(chatbot.allowed_domains[0]);

    const baseUrl =
      process.env.NODE_ENV === "development"
        ? "http://localhost:3000"
        : "https://backend-chatbot-omega.vercel.app";

    const timeWindow = Math.floor(Date.now() / 60000);
    const signature = signDomain(
      domain,
      chatbot.public_id,
      chatbot.install_token,
      timeWindow
    );

    const script = `
<script>
(function(w,d){
  if(w.__CHATBOT_INSTALLED__) return;
  w.__CHATBOT_INSTALLED__ = true;

  var s = d.createElement("script");
  s.src = "${baseUrl}/api/chatbot-integration/chatbot/${chatbot.public_id}.js" +
          "?d=${domain}&t=${chatbot.install_token}&w=${timeWindow}&s=${signature}";
  s.async = true;
  d.head.appendChild(s);
})(window,document);
</script>`.trim();

    res.setHeader("Content-Type", "text/plain");
    res.send(script);
  } catch (error) {
    console.error("GET INSTALL SCRIPT ERROR:", error);
    res.status(500).json({ message: "Error generando script" });
  }
};

/* ═══════════════════════════════════════════════════════════
   SCRIPT DE INTEGRACIÓN (LOADER)
   ═══════════════════════════════════════════════════════════ */
exports.integrationScript = async (req, res) => {
  try {
    const { public_id } = req.params;
    const { d, t, w, s } = req.query;

    if (!d || !t || !w || !s) {
      return res.status(400).send("// Parámetros inválidos");
    }

    const domain = normalizeDomain(d);
    const timeWindow = parseInt(w, 10);

    if (Math.abs(Math.floor(Date.now() / 60000) - timeWindow) > 1) {
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

    if (
      !chatbot.allowed_domains.some(d =>
        domainMatches(domain, d)
      ) &&
      !isLocalhost(domain)
    ) {
      return res.status(403).send("// Dominio no autorizado");
    }

    const expectedSignature = signDomain(
      domain,
      chatbot.public_id,
      chatbot.install_token,
      timeWindow
    );

    if (expectedSignature !== s) {
      return res.status(403).send("// Firma inválida");
    }

    const baseUrl =
      process.env.NODE_ENV === "development"
        ? "http://localhost:3000"
        : "https://backend-chatbot-omega.vercel.app";

    res.setHeader("Content-Type", "application/javascript");
    res.send(`
(function(){
  var iframe = document.createElement("iframe");
  iframe.src = "${baseUrl}/api/chatbot-integration/embed/${chatbot.public_id}?d=${domain}";
  iframe.style.position = "fixed";
  iframe.style.bottom = "20px";
  iframe.style.right = "20px";
  iframe.style.width = "380px";
  iframe.style.height = "600px";
  iframe.style.border = "none";
  iframe.style.zIndex = "999999";
  iframe.allow = "clipboard-write";

  document.body.appendChild(iframe);
})();
    `.trim());
  } catch (error) {
    console.error("INTEGRATION SCRIPT ERROR:", error);
    res.status(500).send("// Error interno");
  }
};

// ═══════════════════════════════════════════════════════════
// MEJORADO: RENDER EMBED CON VALIDACIÓN DE DOMINIO
// ═══════════════════════════════════════════════════════════
exports.renderEmbed = async (req, res) => {
  try {
   const { public_id } = req.params;
    const domain = normalizeDomain(req.query.d || "");

    const chatbot = await Chatbot.findOne({
      public_id,
      status: "active",
      is_enabled: true
    }).lean();

    if (!chatbot) {
      return res.status(404).send("Chatbot no encontrado");
    }

    if (
      !chatbot.allowed_domains.some(d =>
        domainMatches(domain, d)
      ) &&
      !isLocalhost(domain)
    ) {
      return res.status(403).send("Dominio no permitido");
    }

    const {
      name: chatbotName,
      avatar = "",
      primary_color: primaryColor = "#2563eb",
      welcome_delay: welcomeDelay = 1
    } = chatbot;

    const BASE_URL =
      process.env.NODE_ENV === "development"
        ? "http://localhost:3000"
        : "https://backend-chatbot-omega.vercel.app";

    res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${chatbotName}</title>
<style>
body { margin:0;font-family:system-ui;background:#f9fafb; }
.chat { display:flex;flex-direction:column;height:100vh; }
.chat-header { background:${primaryColor};color:white;padding:12px 16px;display:flex;justify-content:space-between;align-items:center; }
main { flex:1;padding:16px;overflow-y:auto; }
footer { display:flex;border-top:1px solid #e5e7eb; }
input { flex:1;padding:14px;border:none;outline:none; }
button { background:${primaryColor};color:white;border:none;padding:0 20px;cursor:pointer; }
</style>
</head>
<body>
<div class="chat">
  <header class="chat-header">${chatbotName}</header>
  <main id="messages"></main>
  <footer>
    <input id="messageInput" placeholder="Escribe tu mensaje…" />
    <button onclick="sendMessage()">Enviar</button>
  </footer>
</div>

<script>
const API_BASE = "${BASE_URL}";
const PUBLIC_ID = "${public_id}";
const WELCOME_DELAY = ${welcomeDelay};

let SESSION_ID = null;

async function startConversation() {
  const res = await fetch(\`\${API_BASE}/api/public-chatbot/chatbot-conversation/\${PUBLIC_ID}/start\`, {
    method: "POST"
  });
  const data = await res.json();
  SESSION_ID = data.session_id;
}

async function sendMessage() {
  const input = document.getElementById("messageInput");
  const value = input.value.trim();
  if (!value) return;

  input.value = "";
  await fetch(\`\${API_BASE}/api/public-chatbot/chatbot-conversation/\${SESSION_ID}/next\`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input: value })
  });
}

startConversation();
</script>
</body>
</html>`);
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


module.exports = exports;