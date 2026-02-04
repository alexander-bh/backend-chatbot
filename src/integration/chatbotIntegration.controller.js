// chatbotIntegration.controller.js
const Chatbot = require("../models/Chatbot");
const sendChatbotInstallEmail = require("../services/sendChatbotInstallEmail.service");
const getChatbotInstallScript = require("../utils/chatbotInstallScript");
const { signDomain } = require("../utils/domainSignature");
const { isDomainAllowed, isLocalhost } = require("../utils/domainValidation");
const crypto = require("crypto");

/**
 * Extrae el dominio desde los headers de la petición
 */
const getDomainFromRequest = req => {
  const origin = req.headers.origin || req.headers.referer;
  if (!origin) return null;

  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return null;
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

    const chatbot = await Chatbot.findOne({
      _id: req.params.id,
      account_id: req.user.account_id
    }).lean();

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    if (!chatbot.allowed_domains?.length) {
      return res.status(400).json({
        message: "Agrega al menos un dominio permitido antes de instalar"
      });
    }

    // ✅ Usar el primer dominio como principal
    const domain = chatbot.allowed_domains[0];

    const script = getChatbotInstallScript({
      domain,
      publicId: chatbot.public_id,
      installToken: chatbot.install_token
    });

    res.json({
      script,
      public_id: chatbot.public_id,
      install_token: chatbot.install_token, // ⚠️ Solo para el dashboard
      allowed_domains: chatbot.allowed_domains,
      installation_status: chatbot.installation_status
    });

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

    const normalizedDomain = domain.replace(/^www\./, "").toLowerCase();
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
// SCRIPT DE INTEGRACIÓN (endpoint público)
// ═══════════════════════════════════════════════════════════
exports.integrationScript = async (req, res) => {
  try {
    const { public_id } = req.params;
    const { d: domain, t: token, w } = req.query;

    // ✅ Configurar headers apropiados
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300"); // 5 minutos
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("X-Content-Type-Options", "nosniff");

    // ─────────── VALIDACIONES BÁSICAS ───────────
    if (!domain || !token || !w) {
      return res.send(`console.warn("[Chatbot] Parámetros inválidos");`);
    }

    if (domain === "*") {
      return res.send(`console.warn("[Chatbot] Dominio comodín no permitido");`);
    }

    // ─────────── VALIDAR VENTANA DE TIEMPO ───────────
    const timeWindow = parseInt(w, 10);
    const now = Math.floor(Date.now() / 60000);

    const MAX_DRIFT = process.env.NODE_ENV === "development" ? 10 : 2;

    if (Number.isNaN(timeWindow) || Math.abs(now - timeWindow) > MAX_DRIFT) {
      return res.send(`console.warn("[Chatbot] Petición expirada. Tiempo actual: ${now}, recibido: ${timeWindow}");`);
    }

    // ─────────── BUSCAR CHATBOT ───────────
    const chatbot = await Chatbot.findOne({
      public_id,
      install_token: token,
      status: "active",
      is_enabled: true
    });

    if (!chatbot) {
      return res.send(`console.warn("[Chatbot] Chatbot no encontrado o deshabilitado");`);
    }

    // ─────────── NORMALIZAR DOMINIO ───────────
    const normalizedDomain = domain.replace(/^www\./, "").toLowerCase();

    // ─────────── VALIDAR LOCALHOST (solo en dev) ───────────
    if (isLocalhost(normalizedDomain)) {
      if (process.env.NODE_ENV !== "development") {
        return res.send(`console.warn("[Chatbot] Localhost no permitido en producción");`);
      }
      // En desarrollo, permitir localhost sin más validaciones
    } else {
      // ─────────── VALIDAR DOMINIO PERMITIDO ───────────
      if (!isDomainAllowed(normalizedDomain, chatbot.allowed_domains)) {
        return res.send(`console.warn("[Chatbot] Dominio '${normalizedDomain}' no autorizado");`);
      }
    }

    // ─────────── VALIDAR ORIGEN DEL REQUEST ───────────
    const requestDomain = getDomainFromRequest(req);
    if (requestDomain) {
      const normalizedRequestDomain = requestDomain.replace(/^www\./, "").toLowerCase();

      if (normalizedRequestDomain !== normalizedDomain && !isLocalhost(normalizedRequestDomain)) {
        return res.send(`console.warn("[Chatbot] Dominio de origen no coincide: esperado '${normalizedDomain}', recibido '${normalizedRequestDomain}'");`);
      }
    }

    // ─────────── VERIFICAR Y REGISTRAR DOMINIO ───────────
    if (!isLocalhost(normalizedDomain) && !chatbot.verified_domains.includes(normalizedDomain)) {
      chatbot.verified_domains.push(normalizedDomain);
      chatbot.installation_status = "verified";
      chatbot.last_verified_at = new Date();
      await chatbot.save();
    }

    // ─────────── GENERAR SCRIPT DEL CHATBOT ───────────
    const embedUrl = process.env.NODE_ENV === "development"
      ? `http://localhost:3000/api/chatbot-integration/embed/${chatbot.public_id}`
      : `https://app.tudominio.com/api/chatbot-integration/embed/embed/${chatbot.public_id}`;

    res.send(`
(function () {
  // Prevenir carga duplicada
  if (window.__CHATBOT_${chatbot.public_id.replace(/-/g, "_").toUpperCase()}__) {
    console.log("[Chatbot] Ya está cargado");
    return;
  }
  window.__CHATBOT_${chatbot.public_id.replace(/-/g, "_").toUpperCase()}__ = true;

  console.log("[Chatbot] Inicializando widget...");

  // Crear contenedor del launcher
  var launcher = document.createElement("div");
  launcher.id = "chatbot-launcher-${chatbot.public_id}";
  launcher.style.cssText = "position:fixed;bottom:20px;right:20px;width:60px;height:60px;border-radius:50%;background:${chatbot.primary_color || "#2563eb"};cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.15);z-index:2147483646;display:flex;align-items:center;justify-content:center;transition:transform .2s;";
  
  launcher.innerHTML = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
  
  launcher.onmouseover = function() { launcher.style.transform = "scale(1.1)"; };
  launcher.onmouseout = function() { launcher.style.transform = "scale(1)"; };

  document.body.appendChild(launcher);

  // Crear iframe del chatbot (inicialmente oculto)
  var iframe = document.createElement("iframe");
  iframe.id = "chatbot-iframe-${chatbot.public_id}";
  iframe.src = "${embedUrl}";
  iframe.title = "${(chatbot.name || 'Chatbot').replace(/"/g, '&quot;')}";
  iframe.style.cssText = "display:none;position:fixed;bottom:90px;right:20px;width:380px;height:600px;max-height:calc(100vh - 120px);border:none;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.2);z-index:2147483647;";
  iframe.allow = "clipboard-write";

  document.body.appendChild(iframe);

  // Toggle al hacer click en el launcher
  var isOpen = false;
  launcher.onclick = function() {
    isOpen = !isOpen;
    iframe.style.display = isOpen ? "block" : "none";
    launcher.style.transform = isOpen ? "rotate(45deg)" : "rotate(0deg)";
  };

  // Escuchar mensajes del iframe
  window.addEventListener("message", function(event) {
    if (event.origin !== "${embedUrl.split('/embed')[0]}") return;

    if (event.data === "chatbot:close") {
      isOpen = false;
      iframe.style.display = "none";
      launcher.style.transform = "rotate(0deg)";
    }

    if (event.data === "chatbot:open") {
      isOpen = true;
      iframe.style.display = "block";
      launcher.style.transform = "rotate(45deg)";
    }
  });

  console.log("[Chatbot] Widget cargado correctamente");
})();
`);

  } catch (error) {
    console.error("INTEGRATION SCRIPT ERROR:", error);
    res.setHeader("Content-Type", "application/javascript");
    res.send(`console.error("[Chatbot] Error cargando widget: ${error.message}");`);
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
    const { id } = req.params;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "Email inválido" });
    }

    const chatbot = await Chatbot.findOne({
      _id: id,
      account_id: req.user.account_id
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

    const chatbot = await Chatbot.findOne({
      _id: req.params.id,
      account_id: req.user.account_id
    });

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    // Generar nuevo token
    chatbot.install_token = crypto.randomBytes(24).toString("hex");
    chatbot.verified_domains = []; // Resetear dominios verificados
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

    if (!domain || typeof domain !== "string") {
      return res.status(400).json({ message: "Dominio inválido" });
    }

    const chatbot = await Chatbot.findOne({
      _id: req.params.id,
      account_id: req.user.account_id
    });

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    const normalizedDomain = domain
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "")
      .replace(/^www\./, "")
      .toLowerCase();

    if (chatbot.allowed_domains.includes(normalizedDomain)) {
      return res.status(400).json({ message: "El dominio ya está agregado" });
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
    if (!req.user?.account_id) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const { domain } = req.body;

    const chatbot = await Chatbot.findOne({
      _id: req.params.id,
      account_id: req.user.account_id
    });

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    const before = chatbot.allowed_domains.length;
    chatbot.allowed_domains = chatbot.allowed_domains.filter(d => d !== domain);

    if (before === chatbot.allowed_domains.length) {
      return res.status(404).json({ message: "Dominio no encontrado" });
    }

    // También remover de verificados si existe
    chatbot.verified_domains = chatbot.verified_domains.filter(d => d !== domain);

    await chatbot.save();

    res.json({
      message: "Dominio eliminado correctamente",
      allowed_domains: chatbot.allowed_domains
    });

  } catch (error) {
    console.error("REMOVE DOMAIN ERROR:", error);
    res.status(500).json({ message: "Error al eliminar dominio" });
  }
};

exports.renderEmbed = async (req, res) => {
  const { public_id } = req.params;

  // (opcional) aquí luego validas que el chatbot exista
  res.setHeader("Content-Type", "text/html; charset=utf-8");

  res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Chatbot</title>
  <style>
    body {
      margin: 0;
      font-family: system-ui, -apple-system, BlinkMacSystemFont;
      background: #f9fafb;
    }
    .chat {
      display: flex;
      flex-direction: column;
      height: 100vh;
    }
    header {
      padding: 12px;
      background: #2563eb;
      color: white;
      font-weight: 600;
    }
    main {
      flex: 1;
      padding: 12px;
      overflow-y: auto;
    }
    footer {
      display: flex;
      border-top: 1px solid #e5e7eb;
    }
    input {
      flex: 1;
      border: none;
      padding: 12px;
      outline: none;
      font-size: 14px;
    }
    button {
      border: none;
      padding: 0 16px;
      background: #2563eb;
      color: white;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="chat">
    <header>Chatbot ${public_id}</header>
    <main>
      <p>👋 Hola, soy tu chatbot</p>
    </main>
    <footer>
      <input placeholder="Escribe tu mensaje..." />
      <button>Enviar</button>
    </footer>
  </div>
</body>
</html>
  `);
};


module.exports = exports;