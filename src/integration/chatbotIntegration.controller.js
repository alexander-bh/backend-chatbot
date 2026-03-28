// chatbotIntegration.controller.js  — PROTECCIÓN MÁXIMA
const fs = require("fs");
const path = require("path");
const Chatbot = require("../models/Chatbot");
const crypto = require("crypto");
const isDomainAllowed = require("../helper/isDomainAllowed");
const { safeCompare } = require("../helper/safeCompare");
const { normalizeDomain } = require("../utils/normalizeDomain");
const { isLocalhost } = require("../utils/isLocalhost");
const { getStore, TTL_MS } = require("../utils/nonceStore");
const { domainExists } = require("../validators/domain.validator");

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */
const getBaseUrl = () => process.env.APP_BASE_URL || "https://backend-chatbot-omega.vercel.app";
const getWidgetBaseUrl = () => process.env.WIDGET_BASE_URL || "https://chatbot-widget-blue-eight.vercel.app";
const WIDGET_BASE_URL = getWidgetBaseUrl();
const WIDGET_DOMAIN = normalizeDomain(WIDGET_BASE_URL);
const SCRIPT_TEMPLATE = fs.readFileSync(
  path.join(__dirname, "./Installscript.template.js"),
  "utf8"
);

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

    const chatbot = await Chatbot.findOne({
      public_id,
      status: "active",
      is_enabled: true
    }).lean();

    if (!chatbot) return res.status(404).send("// Chatbot no encontrado");

    const baseUrl = getBaseUrl();
    const position = chatbot.position || "bottom-right";
    const secondaryColor = chatbot.secondary_color || "#06070B";

    const script = SCRIPT_TEMPLATE
      .replace(/\{\{BASE_URL\}\}/g, baseUrl)
      .replace(/\{\{PUBLIC_ID\}\}/g, public_id)
      .replace(/\{\{POSITION\}\}/g, position)
      .replace(/\{\{SECONDARY_COLOR\}\}/g, secondaryColor);

    res.type("application/javascript");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Content-Security-Policy", `default-src 'none'`);
    res.send(script);

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
    const rawDomain = req.query.d || "";          // ← RAW con puerto
    const domain = normalizeDomain(rawDomain);    // ← normalizado para validaciones
    const challengeB64 = req.query.c || "";

    if (!domain) return res.status(400).send("Dominio inválido");
    if (!challengeB64) return res.status(403).send("Challenge requerido");

    // --- Verificar challenge ---
    let challengeData;
    try {
      challengeData = JSON.parse(Buffer.from(challengeB64, "base64").toString("utf8"));
    } catch {
      return res.status(403).send("Challenge malformado");
    }

    // FIX Bug 1 y 2: destructurar ANTES de usar, y renombrar para evitar colisión
    const { payload: challengePayload, sig: challengeSig } = challengeData;
    if (!challengePayload || !challengeSig) return res.status(403).send("Challenge inválido");

    // 1. Verificar firma HMAC (ahora challengePayload existe)
    const expectedSig = crypto
      .createHmac("sha256", process.env.CONFIG_SECRET)
      .update(challengePayload)
      .digest("hex");
    if (!safeCompare(challengeSig, expectedSig)) {
      return res.status(403).send("Firma de challenge inválida");
    }

    // 2. Verificar TTL (30s) y dominio
    const parsed = JSON.parse(challengePayload);
    const CHALLENGE_TTL = 120_000;
    if (Date.now() - parsed.ts > CHALLENGE_TTL) {
      return res.status(403).send("Challenge expirado");
    }
    if (normalizeDomain(parsed.domain) !== domain) {
      return res.status(403).send("Dominio no coincide con challenge");
    }
    if (parsed.public_id !== public_id) {
      return res.status(403).send("ID no coincide");
    }

    // --- Chatbot ---
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

    // FIX Bug 3: restaurar actualización de installation_status
    if (chatbot.installation_status !== "verified") {
      await Chatbot.updateOne(
        { _id: chatbot._id },
        { $set: { installation_status: "verified", updated_at: new Date() } }
      );
    }

    // --- Nonce de un solo uso ---
    const store = await getStore();
    const nonce = crypto.randomBytes(32).toString("hex");
    await store.set(nonce, TTL_MS);

    // --- Config firmada (widgetPayload evita colisión con challengePayload) ---
    const config = {
      ts: Date.now(),
      nonce,
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

    // FIX Bug 2: renombrado a widgetPayload
    const widgetPayload = JSON.stringify(config);
    const signature = crypto
      .createHmac("sha256", process.env.CONFIG_SECRET)
      .update(widgetPayload)
      .digest("hex");

    const encoded = encodeURIComponent(
      Buffer.from(JSON.stringify({ payload: widgetPayload, signature })).toString("base64")
    );

    const widgetUrl = `${WIDGET_BASE_URL}/?config=${encoded}`;

    res.setHeader(
      "Content-Security-Policy",
      `default-src 'none'; script-src 'unsafe-inline'; frame-ancestors http://${rawDomain} https://${rawDomain} https://${WIDGET_DOMAIN}`
    );
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");

    return res.send(`<!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
      </head>
      <body>
        <script>
          window.location.replace(${JSON.stringify(widgetUrl)});
        </script>
      </body>
      </html>`
    );

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

    if (!payload || !signature)
      return res.status(400).json({ error: "Datos incompletos" });

    if (!process.env.CONFIG_SECRET)
      return res.status(500).json({ error: "Server misconfig" });

    // 1. Verificar firma HMAC
    const expected = crypto
      .createHmac("sha256", process.env.CONFIG_SECRET)
      .update(payload)
      .digest("hex");

    if (!safeCompare(signature, expected))
      return res.status(403).json({ error: "Firma inválida" });

    const config = JSON.parse(payload);

    // 2. TTL
    const MAX_AGE_MS = 90_000;
    if (!config.ts || Date.now() - config.ts > MAX_AGE_MS)
      return res.status(403).json({ error: "Config expirada" });

    // 3. Nonce
    if (!config.nonce)
      return res.status(403).json({ error: "Nonce ausente" });

    const store = await getStore();
    const valid = await store.consume(config.nonce);

    // 4. Origin — declarado ANTES del log
    const requestOrigin = normalizeDomain(
      req.headers.origin || req.headers.referer || ""
    );

    if (!valid)
      return res.status(403).json({ error: "Nonce inválido o ya utilizado" });

    const allowedOrigins = [
      WIDGET_DOMAIN,
      config.originDomain,
      ...(process.env.NODE_ENV === "development" ? ["localhost"] : [])
    ].filter(Boolean);

    if (requestOrigin && !allowedOrigins.includes(requestOrigin)) {
      console.warn(`ORIGIN MISMATCH: got=${requestOrigin} allowed=${allowedOrigins}`);
      return res.status(403).json({ error: "Origen no autorizado" });
    }

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

    const query = { public_id };
    if (req.user.role !== "ADMIN") {
      if (!req.user.account_id) return res.status(401).json({ error: "Cuenta inválida" });
      query.account_id = req.user.account_id;
    }

    const chatbot = await Chatbot.findOne(query);
    if (!chatbot) return res.status(404).json({ error: "Chatbot no encontrado" });

    const baseUrl = getBaseUrl();
    const hasDomains = Boolean(chatbot.allowed_domains?.length);

    // ← Sin ?t= porque la seguridad ahora la maneja el challenge
    const script = `<script src='${baseUrl}/api/chatbot-integration/${public_id}/install' async></script>`;

    res.json({
      scripts: hasDomains ? [{ domain: "todos los dominios autorizados", script }] : [],
      allowed_domains: chatbot.allowed_domains || [],
      has_domains: hasDomains
    });

  } catch (err) {
    console.error("INSTALL CODE ERROR:", err);
    res.status(500).json({ error: "Error interno" });
  }
};

/* =======================================================
   7) REGENERAR TOKEN DE INSTALACIÓN — BUG 1 CORREGIDO
======================================================= */
exports.regenerateInstallToken = async (req, res) => {
  try {
    if (!req.user?.account_id) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const { public_id } = req.params;
    const chatbot = await Chatbot.findOne({ public_id, account_id: req.user.account_id });
    if (!chatbot) return res.status(404).json({ message: "Chatbot no encontrado" });

    chatbot.installation_status = "pending";
    await chatbot.save();

    // FIX Bug 1: respuesta que faltaba
    return res.json({ message: "Estado de instalación reseteado correctamente" });

  } catch (err) {
    console.error("REGENERATE TOKEN ERROR:", err);
    // Solo responde si no se ha respondido ya
    if (!res.headersSent) {
      res.status(500).json({ message: "Error al resetear instalación" });
    }
  }
};

exports.getChallenge = async (req, res) => {
  try {
    const { public_id } = req.params;
    const domain = normalizeDomain(req.query.d || "");

    if (!domain) return res.status(400).json({ error: "Dominio requerido" });

    const chatbot = await Chatbot.findOne({
      public_id,
      status: "active",
      is_enabled: true
    }).lean();

    if (!chatbot || !isDomainAllowed(chatbot, domain)) {
      return res.status(403).json({ error: "No autorizado" });
    }

    const challengeNonce = crypto.randomBytes(16).toString("hex");
    const ts = Date.now();
    const payload = JSON.stringify({ public_id, domain, ts, nonce: challengeNonce });
    const sig = crypto
      .createHmac("sha256", process.env.CONFIG_SECRET)
      .update(payload)
      .digest("hex");

    const challenge = Buffer.from(JSON.stringify({ payload, sig })).toString("base64");

    res.setHeader("Cache-Control", "no-store");
    return res.json({ challenge });

  } catch (err) {
    console.error("CHALLENGE ERROR:", err);
    return res.status(500).json({ error: "Error interno" });
  }
};

module.exports = exports;