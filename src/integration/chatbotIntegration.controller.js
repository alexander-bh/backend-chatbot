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

    console.log("🔍 Chatbot encontrado:", {
      public_id: chatbot?.public_id,
      has_install_token: !!chatbot?.install_token,
      install_token_value: chatbot?.install_token
    });

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    // ✅ Genera install_token si no existe (backward compatibility)
    if (!chatbot.install_token) {
      chatbot.install_token = crypto.randomBytes(24).toString("hex");
      await chatbot.save();
    }

    if (!chatbot.allowed_domains?.length) {
      return res.status(400).json({
        message: "Agrega al menos un dominio permitido antes de instalar"
      });
    }

    const domain = normalizeDomain(chatbot.allowed_domains[0]);
    const baseUrl = process.env.APP_BASE_URL;
    //process.env.NODE_ENV === "development"
    //  ? "http://localhost:3000"
    //  : "https://backend-chatbot-omega.vercel.app";

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

    if (Number.isNaN(timeWindow)) {
      return res.status(400).send("// Timestamp inválido");
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

    if (
      !chatbot.allowed_domains.some(d =>
        domainMatches(domain, d)
      ) &&
      !isLocalhost(domain)
    ) {
      return res.status(403).send("// Dominio no autorizado");
    }

    // 🔐 Validación de firma con ventana deslizante
    let valid = false;

    for (let offset = -WINDOW; offset <= WINDOW; offset++) {
      const expected = signDomain(
        domain,
        chatbot.public_id,
        chatbot.install_token,
        timeWindow + offset
      );

      if (expected === s) {
        valid = true;
        break;
      }
    }

    if (!valid) {
      return res.status(403).send("// Firma inválida");
    }

    const baseUrl = process.env.APP_BASE_URL;
    // process.env.NODE_ENV === "development"
    //   ? "http://localhost:3000"
    //   : "https://backend-chatbot-omega.vercel.app";

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

    const allowedDomains = chatbot.allowed_domains || [];

    const domainAllowed =
      allowedDomains.some(d => domainMatches(domain, d)) ||
      isLocalhost(domain);

    if (!domainAllowed) {
      return res.status(403).send("Dominio no permitido");
    }

    /* ===============================
       HEADERS
    ================================ */

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");

    // CSP más seguro
    const cspDomains = allowedDomains.join(" ");

    res.setHeader(
      "Content-Security-Policy",
      `frame-ancestors 'self' ${cspDomains}`.trim()
    );

    const apiBase = process.env.APP_BASE_URL || "";

    /* ===============================
       RESPONSE
    ================================ */

    res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${chatbot.name}</title>

        <link rel="stylesheet" href="/public/chatbot/embed.css" />
      </head>
      <body>

      <!-- FAB BUTTON -->
      <button
        class="chat-fab"
        id="chatToggle"
        type="button"
        aria-label="Abrir chat"
      >

        <svg
          class="chat-icon"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M21 15a4 4 0 0 1-4 4H7l-4 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/>
        </svg>

      </button>


      <!-- CHAT WIDGET -->
      <div class="chat-widget" id="chatWidget">

        <div class="chat">

          <header class="chat-header">
            <img
              id="chatAvatar"
              class="chat-avatar"
              hidden
            />

            <strong id="chatName">Chatbot</strong>
          </header>


          <main id="messages"></main>


          <footer>
            <input
              id="messageInput"
              placeholder="Escribe tu mensaje…"
            />

            <button id="sendBtn">
              Enviar
            </button>
          </footer>

        </div>
      </div>


      <!-- CONFIG -->
      <script>
        window.__CHATBOT_CONFIG__ = {
          apiBase: ${JSON.stringify(apiBase)},
          publicId: ${JSON.stringify(public_id)},

          name: ${JSON.stringify(chatbot.name)},
          avatar: ${JSON.stringify(chatbot.avatar || "")},

          primaryColor: ${JSON.stringify(chatbot.primary_color || "#2563eb")},
          secondaryColor: ${JSON.stringify(chatbot.secondary_color || "#111827")},

          inputPlaceholder: ${JSON.stringify(
            chatbot.input_placeholder || "Escribe tu mensaje…"
          )}
        };
      </script>


      <!-- SCRIPT -->
      <script
        src="/public/chatbot/embed.js"
        defer
      ></script>

      </body>
      </html>
    `);

  } catch (err) {
    console.error("RENDER EMBED ERROR:", err);

    res
      .status(500)
      .send("No se pudo cargar el chatbot");
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