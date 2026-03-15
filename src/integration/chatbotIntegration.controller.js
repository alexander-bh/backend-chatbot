// chatbotIntegration.controller.js  — PROTECCIÓN MÁXIMA
const Chatbot = require("../models/Chatbot");
const crypto = require("crypto");
const isDomainAllowed = require("../helper/isDomainAllowed");
const { normalizeDomain } = require("../utils/normalizeDomain");
const { isLocalhost } = require("../utils/isLocalhost");
const { domainExists } = require("../validators/domain.validator");
const { getStore, TTL_MS } = require("../utils/nonceStore"); // ← NUEVO

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */
const getBaseUrl = () => process.env.APP_BASE_URL || "https://backend-chatbot-omega.vercel.app";
const getWidgetBaseUrl = () => process.env.WIDGET_BASE_URL || "https://chatbot-widget-blue-eight.vercel.app";

const WIDGET_BASE_URL = getWidgetBaseUrl();
const WIDGET_DOMAIN = normalizeDomain(WIDGET_BASE_URL);

function getPositionStyles(position, isOpen) {
  if (position === "bottom-left") {
    return `"bottom:20px","left:20px"`;
  } else if (position === "middle-right") {
    return `"top:calc(50% - 40px)","right:20px"`;
  } else {
    // bottom-right default
    return `"bottom:20px","right:20px"`;
  }
}

/**
 * Extrae el dominio del request de forma segura.
 * Prioriza Origin (más difícil de falsificar en navegadores) sobre Referer.
 */
function extractDomain(req) {
  const raw = req.headers.origin || req.headers.referer || "";
  const domain = normalizeDomain(raw);
  if (domain) return domain;
  if (process.env.NODE_ENV === "development") return "localhost";
  return null;
}

/**
 * Timing-safe string compare que también compara longitud.
 */
function safeCompare(a, b) {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/* =======================================================
   1) GET INSTALL SCRIPT  →  /:public_id/install
   
   PROTECCIONES:
   - Token de instalación en query param
   - Validación de Origin/Referer contra dominios permitidos
   - El script resultante es inútil fuera del dominio autorizado
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
 
    if (!chatbot) return res.status(404).send("// Chatbot no encontrado");
 
    if (!token || !chatbot.install_token) {
      return res.status(403).send("// Token inválido");
    }
 
    const tokenMatch = safeCompare(
      crypto.createHash("sha256").update(token).digest("hex"),
      crypto.createHash("sha256").update(chatbot.install_token).digest("hex")
    );
 
    if (!tokenMatch) return res.status(403).send("// Token inválido");
 
    const domain = extractDomain(req);
    if (!domain) return res.status(403).send("// Dominio no detectable");
 
    if (!isDomainAllowed(chatbot, domain)) {
      return res.status(403).send("// Dominio no autorizado");
    }
 
    if (chatbot.installation_status !== "verified") {
      await Chatbot.updateOne(
        { _id: chatbot._id },
        { $set: { installation_status: "verified", updated_at: new Date() } }
      );
    }
 
    const baseUrl = getBaseUrl();
    const safeDomain = encodeURIComponent(domain);
    const position = chatbot.position || "bottom-right";
    const positionStyles = getPositionStyles(position);
 
    res.type("application/javascript");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Content-Security-Policy", `default-src 'none'`);
 
    res.send(`(function(){
  if (window.__CHATBOT_INSTALLED__) {
    var ex = document.getElementById('__chatbot_iframe__');
    if (ex) return;
    window.__CHATBOT_INSTALLED__ = false;
  }
  window.__CHATBOT_INSTALLED__ = true;
 
  var POSITION = "${position}";
 
  /* ── Welcome bubble ── */
  var welcomeEl = null;
  var pendingWelcome = null;
 
  function createWelcome(message) {
  var el = document.createElement("div");
  var isLeft = POSITION === "bottom-left";
  var isMiddle = POSITION === "middle-right";

  el.style.cssText = [
    "position:fixed",
    "z-index:2147483648",
    "max-width:260px",
    "padding:14px 18px",
    "background:white",
    "color:#0f172a",
    "font-size:14px",
    "font-weight:600",
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    "line-height:1.5",
    "border-radius:18px",
    "border:1.5px solid #e2e8f0",
    "box-shadow:0 4px 20px rgba(0,0,0,0.10),0 1px 4px rgba(0,0,0,0.06)",
    "opacity:0",
    "pointer-events:none",
    "cursor:default",
    "transition:opacity 0.35s ease,transform 0.35s ease",
    // ✅ Posición vertical según modo
    isMiddle ? "top:50%" : "bottom:110px",
    // ✅ Posición horizontal — dejar espacio para el FAB (80px) + margen (20px) + gap (12px)
    isLeft  ? "left:112px"  : "right:112px",
    // ✅ Transform inicial para animación de entrada
    isMiddle
      ? (isLeft ? "transform:translateX(-10px) translateY(-50%) scale(0.97)"
                : "transform:translateX(10px) translateY(-50%) scale(0.97)")
      : (isLeft ? "transform:translateX(-10px) scale(0.97)"
                : "transform:translateX(10px) scale(0.97)")
  ].join(";");

  var arrow = document.createElement("div");
  arrow.style.cssText = [
    "position:absolute",
    "width:14px",
    "height:14px",
    "background:white",
    isLeft
      ? "left:-8px;top:50%;transform:translateY(-50%) rotate(45deg);border-left:1.5px solid #e2e8f0;border-bottom:1.5px solid #e2e8f0"
      : "right:-8px;top:50%;transform:translateY(-50%) rotate(45deg);border-right:1.5px solid #e2e8f0;border-top:1.5px solid #e2e8f0"
  ].join(";");

  el.appendChild(arrow);
  var text = document.createElement("span");
  text.textContent = message;
  el.appendChild(text);
  document.body.appendChild(el);
  return el;
  }
  
  function showWelcome(message) {
  if (welcomeEl) { welcomeEl.remove(); welcomeEl = null; }
  welcomeEl = createWelcome(message);
  var isMiddle = POSITION === "middle-right";
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      if (!welcomeEl) return;
      welcomeEl.style.opacity = "1";
      welcomeEl.style.transform = isMiddle
        ? "translateX(0) translateY(-50%) scale(1)"
        : "translateX(0) scale(1)";
    });
  });
  }
 
  function hideWelcome() {
    if (!welcomeEl) return;
    welcomeEl.style.opacity = "0";
    welcomeEl.style.pointerEvents = "none";
    var el = welcomeEl;
    welcomeEl = null;
    setTimeout(function() { if (el.parentNode) el.remove(); }, 400);
  }
 
  /* ── iframe ── */
  var iframe = document.createElement("iframe");
  iframe.id = "__chatbot_iframe__";
  iframe.src = "${baseUrl}/api/chatbot-integration/embed/${public_id}?d=${safeDomain}";
  iframe.style.cssText = [
    "position:fixed",
    ${positionStyles},
    "width:80px",
    "height:80px",
    "border:none",
    "z-index:2147483647",
    "background:transparent",
    "pointer-events:auto",
    "overflow:hidden",
    "border-radius:50%",
    "transition:width 0.3s ease,height 0.3s ease,border-radius 0.3s ease,bottom 0.3s ease,right 0.3s ease,left 0.3s ease,top 0.3s ease"
  ].join(";");
 
  iframe.sandbox = "allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation";
  iframe.setAttribute("allow", "clipboard-write");
 
  /* ── FIX: declarar iframeLoaded ANTES de usarlo ── */
  var iframeLoaded = false;
 
  iframe.addEventListener("load", function() {
    iframeLoaded = true; // ← marcar como cargado
    if (pendingWelcome) {
      var msg = pendingWelcome;
      pendingWelcome = null;
      setTimeout(function() { showWelcome(msg); }, 300);
    }
  });
 
  document.body.appendChild(iframe);
 
  /* ── Control de welcome — basado en esta carga de página ── */
  var _welcomeShownThisLoad = false;
 
  /* ── Listener único para todos los mensajes ── */
  window.addEventListener("message", function(e) {
    if (!e.data || !e.data.type) return;
 
    /* Welcome — renderizar burbuja en el padre */
    if (e.data.type === "CHATBOT_WELCOME") {
      if (e.data.visible && e.data.message) {
        if (!iframeLoaded) {
          pendingWelcome = e.data.message; // espera a que cargue el iframe
        } else {
          showWelcome(e.data.message);     // muestra directo
        }
      } else {
        hideWelcome();
      }
      return;
    }
 
    /* Welcome Request — el widget pregunta si puede mostrar el welcome */
    if (e.data.type === "CHATBOT_WELCOME_REQUEST") {
      iframe.contentWindow.postMessage({
        type: "CHATBOT_WELCOME_PERMISSION",
        allowed: !_welcomeShownThisLoad
      }, "*");
      if (!_welcomeShownThisLoad) _welcomeShownThisLoad = true;
      return;
    }
 
    /* Welcome Seen — el usuario abrió el chat */
    if (e.data.type === "CHATBOT_WELCOME_SEEN") {
      _welcomeShownThisLoad = true;
      return;
    }
 
    /* Resize */
    if (e.data.type === "CHATBOT_RESIZE") {
      if (e.data.open) {
        hideWelcome();
        iframe.style.borderRadius = "16px";
        iframe.style.overflow     = "visible";
 
        var isMobile = window.innerWidth <= 480;
        if (isMobile) {
          iframe.style.width  = "100vw";
          iframe.style.height = "100vh";
          iframe.style.top    = "0";
          iframe.style.left   = "0";
          iframe.style.bottom = "auto";
          iframe.style.right  = "auto";
        } else {
          var w = Math.min(420, window.innerWidth - 40);
          var h = Math.min(680, window.innerHeight - 60);
          iframe.style.width  = w + "px";
          iframe.style.height = h + "px";
 
          if (POSITION === "bottom-left") {
            iframe.style.bottom    = "20px";
            iframe.style.left      = "20px";
            iframe.style.right     = "auto";
            iframe.style.top       = "auto";
            iframe.style.transform = "";
          } else if (POSITION === "middle-right") {
            iframe.style.top       = "50%";
            iframe.style.right     = "20px";
            iframe.style.bottom    = "auto";
            iframe.style.left      = "auto";
            iframe.style.transform = "translateY(-50%)";
          } else {
            iframe.style.bottom    = "20px";
            iframe.style.right     = "20px";
            iframe.style.left      = "auto";
            iframe.style.top       = "auto";
            iframe.style.transform = "";
          }
        }
 
      } else {
        iframe.style.width        = "80px";
        iframe.style.height       = "80px";
        iframe.style.borderRadius = "50%";
        iframe.style.overflow     = "hidden";
        iframe.style.transform    = "";
 
        if (POSITION === "bottom-left") {
          iframe.style.bottom = "20px";
          iframe.style.left   = "20px";
          iframe.style.right  = "auto";
          iframe.style.top    = "auto";
        } else if (POSITION === "middle-right") {
          iframe.style.top    = "calc(50% - 40px)";
          iframe.style.right  = "20px";
          iframe.style.bottom = "auto";
          iframe.style.left   = "auto";
        } else {
          iframe.style.bottom = "20px";
          iframe.style.right  = "20px";
          iframe.style.left   = "auto";
          iframe.style.top    = "auto";
        }
      }
    }
  });
 
  /* ── MutationObserver para re-insertar si la SPA limpia el DOM ── */
  var _chatbotObserver = new MutationObserver(function() {
    if (!document.getElementById('__chatbot_iframe__')) {
      document.body.appendChild(iframe);
    }
    if (welcomeEl && !document.body.contains(welcomeEl)) {
      document.body.appendChild(welcomeEl);
    }
  });
  _chatbotObserver.observe(document.body, { childList: true });
 
})();`);
 
  } catch (err) {
    console.error("INSTALL SCRIPT ERROR:", err);
    res.status(500).send("// Error interno");
  }
};


/* =======================================================
   3) RENDER EMBED (HTML)
   
   PROTECCIONES NUEVAS:
   ✅ Nonce de un solo uso (90s TTL)
   ✅ Nonce incluido en payload firmado
   ✅ Origin validado contra dominios permitidos
   ✅ CSP frame-ancestors restrictivo
   ✅ TTL de config reducido a 90s
======================================================= */
exports.renderEmbed = async (req, res) => {
  try {
    const { public_id } = req.params;
    const domain = normalizeDomain(req.query.d || "");

    if (!domain) return res.status(400).send("Dominio inválido");

    // 1. Validar que el Origin real coincida con el dominio declarado
    const requestDomain = extractDomain(req);
    if (
      requestDomain &&
      requestDomain !== domain &&
      requestDomain !== "localhost"
    ) {
      console.warn(`EMBED DOMAIN MISMATCH: declared=${domain} actual=${requestDomain}`);
      return res.status(403).send("Dominio no coincide");
    }

    // 2. Chatbot activo
    const chatbot = await Chatbot.findOne({
      public_id,
      status: "active",
      is_enabled: true
    }).lean();

    if (!chatbot) return res.status(404).send("Chatbot no encontrado");

    if (!chatbot.allowed_domains?.length && process.env.NODE_ENV === "production") {
      return res.status(403).send("Chatbot sin dominios configurados");
    }

    if (!isDomainAllowed(chatbot, domain)) {
      return res.status(403).send("Dominio no permitido");
    }

    // 3. Generar nonce de un solo uso
    const store = await getStore();
    const nonce = crypto.randomBytes(32).toString("hex");
    await store.set(nonce, TTL_MS);

    // 4. Construir config con nonce + TTL corto
    const config = {
      ts: Date.now(),
      nonce,                                          // ← NUEVO
      apiBase: getBaseUrl(),
      publicId: public_id,
      originDomain: domain,
      name: chatbot.name,
      avatar: chatbot.avatar || "",
      primaryColor: chatbot.primary_color || "#2563eb",
      secondaryColor: chatbot.secondary_color || "#111827",
      inputPlaceholder: chatbot.input_placeholder || "Escribe tu mensaje...",
      welcomeMessage: chatbot.welcome_message || "",
      welcomeDelay: chatbot.welcome_delay ?? 2,
      showWelcomeOnMobile: chatbot.show_welcome_on_mobile ?? true,
      position: chatbot.position || "bottom-right"
    };

    const payload = JSON.stringify(config);
    const signature = crypto
      .createHmac("sha256", process.env.CONFIG_SECRET)
      .update(payload)
      .digest("hex");

    const encoded = encodeURIComponent(
      Buffer.from(JSON.stringify({ payload, signature })).toString("base64")
    );

    const widgetUrl = `${WIDGET_BASE_URL}/?config=${encoded}`;

    res.setHeader(
      "Content-Security-Policy",
      `frame-ancestors 'self' https://${WIDGET_DOMAIN} http://${domain} https://${domain}`
    );
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");

    return res.redirect(widgetUrl);

  } catch (err) {
    console.error("RENDER EMBED ERROR:", err);
    return res.status(500).send("No se pudo cargar el chatbot");
  }
};


/* =======================================================
   8) VERIFICAR FIRMA DE CONFIG  (endpoint del widget)
   
   PROTECCIONES NUEVAS:
   ✅ Nonce consumido (un solo uso, atómico en Redis)
   ✅ TTL de 90s (era 5min)
   ✅ Origin validado contra originDomain de la config
   ✅ Timing-safe comparison
======================================================= */
exports.verifyConfigSignature = async (req, res) => {
  try {
    const { payload, signature } = req.body;

    if (!payload || !signature) {
      return res.status(400).json({ error: "Datos incompletos" });
    }

    if (!process.env.CONFIG_SECRET) {
      return res.status(500).json({ error: "Server misconfig" });
    }

    // 1. Verificar firma HMAC (timing-safe)
    const expected = crypto
      .createHmac("sha256", process.env.CONFIG_SECRET)
      .update(payload)
      .digest("hex");

    if (!safeCompare(signature, expected)) {
      return res.status(403).json({ error: "Firma inválida" });
    }

    const config = JSON.parse(payload);

    // 2. TTL reducido a 90s (anti-replay por tiempo)
    const MAX_AGE_MS = 90_000;
    if (!config.ts || Date.now() - config.ts > MAX_AGE_MS) {
      return res.status(403).json({ error: "Config expirada" });
    }

    // 3. Validar nonce (un solo uso — consume atómicamente)
    if (!config.nonce) {
      return res.status(403).json({ error: "Nonce ausente" });
    }

    const store = await getStore();
    const valid = await store.consume(config.nonce);

    if (!valid) {
      // Nonce ya usado o expirado → posible replay attack
      console.warn(`REPLAY ATTEMPT: nonce=${config.nonce} publicId=${config.publicId}`);
      return res.status(403).json({ error: "Nonce inválido o ya utilizado" });
    }

    // 4. Validar Origin del widget contra el dominio de la config
    const requestOrigin = normalizeDomain(
      req.headers.origin || req.headers.referer || ""
    );

    // El widget vive en WIDGET_DOMAIN — se permite ese origen
    const allowedOrigins = [
      WIDGET_DOMAIN,
      config.originDomain,
      ...(process.env.NODE_ENV === "development" ? ["localhost"] : [])
    ].filter(Boolean);

    if (requestOrigin && !allowedOrigins.includes(requestOrigin)) {
      console.warn(`ORIGIN MISMATCH on verify: got=${requestOrigin} allowed=${allowedOrigins}`);
      return res.status(403).json({ error: "Origen no autorizado" });
    }

    // 5. Devolver config limpia (sin nonce para no exponerlo de nuevo)
    const { nonce: _n, ...safeConfig } = config;
    res.json(safeConfig);

  } catch (err) {
    console.error("VERIFY SIGNATURE:", err);
    res.status(500).json({ error: "Error interno" });
  }
};


/* =======================================================
   4) AGREGAR DOMINIO
======================================================= */
exports.addAllowedDomain = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: "No autorizado" });

    const { public_id } = req.params;
    const normalized = normalizeDomain(req.body.domain);
    if (!normalized) return res.status(400).json({ error: "Dominio inválido" });

    const normalizedLower = normalized.toLowerCase();
    const isDev = process.env.NODE_ENV !== "production";

    if (isLocalhost(normalizedLower)) {
      if (!isDev) return res.status(400).json({ error: "Dominios localhost no permitidos en producción" });
    } else {
      const exists = await domainExists(normalizedLower);
      if (!exists) return res.status(400).json({ error: "El dominio no existe en DNS" });
    }

    const query = { public_id };
    if (req.user.role !== "ADMIN") {
      if (!req.user.account_id) return res.status(401).json({ error: "Cuenta inválida" });
      query.account_id = req.user.account_id;
    }

    const chatbot = await Chatbot.findOne(query);
    if (!chatbot) return res.status(404).json({ error: "Chatbot no encontrado" });

    const alreadyExists = chatbot.allowed_domains.some(d => d.toLowerCase() === normalizedLower);
    if (alreadyExists) return res.status(400).json({ error: "Dominio ya existe" });

    chatbot.allowed_domains.push(normalizedLower);
    chatbot.allowed_domains = [...new Set(chatbot.allowed_domains.map(d => d.toLowerCase()))];
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
    if (!req.user) return res.status(401).json({ error: "No autorizado" });

    const { public_id } = req.params;
    const domain = normalizeDomain(req.body.domain);

    const query = { public_id };
    if (req.user.role !== "ADMIN") {
      if (!req.user.account_id) return res.status(401).json({ error: "Cuenta inválida" });
      query.account_id = req.user.account_id;
    }

    const chatbot = await Chatbot.findOne(query);
    if (!chatbot) return res.status(404).json({ error: "Chatbot no encontrado" });

    chatbot.allowed_domains = chatbot.allowed_domains.filter(d => d !== domain);
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
    if (!req.user) return res.status(401).json({ error: "No autorizado" });

    const { public_id } = req.params;

    // ✅ Filtrar por cuenta del usuario autenticado
    const query = { public_id };
    if (req.user.role !== "ADMIN") {
      if (!req.user.account_id) return res.status(401).json({ error: "Cuenta inválida" });
      query.account_id = req.user.account_id;
    }

    const chatbot = await Chatbot.findOne(query);
    if (!chatbot) return res.status(404).json({ error: "Chatbot no encontrado" });

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
    if (!req.user?.account_id) return res.status(401).json({ message: "Usuario no autenticado" });

    const { public_id } = req.params;
    const chatbot = await Chatbot.findOne({ public_id, account_id: req.user.account_id });
    if (!chatbot) return res.status(404).json({ message: "Chatbot no encontrado" });

    chatbot.install_token = crypto.randomBytes(32).toString("hex");
    chatbot.allowed_domains = [];
    chatbot.installation_status = "pending";
    await chatbot.save();

    res.json({ message: "Token regenerado correctamente", install_token: chatbot.install_token });
  } catch (err) {
    console.error("REGENERATE TOKEN ERROR:", err);
    res.status(500).json({ message: "Error al regenerar token" });
  }
};

module.exports = exports;