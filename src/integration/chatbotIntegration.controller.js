//chatbotIntegration.controller
const Chatbot = require("../models/Chatbot");
const crypto = require("crypto");
const path = require("path");
const { isLocalhost } = require("../utils/domainValidation");
const { domainMatches } = require("../utils/domainMatch");
const { normalizeDomain } = require("../utils/domain.utils");
const { domainExists } = require("../utils/domain.validator");

const getBaseUrl = () =>
  process.env.APP_BASE_URL || "https://backend-chatbot-omega.vercel.app";

//Extraer dominio y puerto desde Origin
exports.serveWidget = async (req, res) => {
  try {
    const chatbot = await Chatbot.findOne({ public_id: req.params.publicId });

    if (!chatbot) {
      return res.status(404).json({ error: "Chatbot no encontrado" });
    }

    if (!req.query.t || req.query.t !== chatbot.install_token) {
      return res.status(403).json({ error: "Token inválido" });
    }

    const rawOrigin = req.headers.origin || req.headers.referer || "";
    const originDomain = normalizeDomain(rawOrigin);

    const isProd = process.env.NODE_ENV === "production";
    const isDev = !isProd;

    const domainAllowed = chatbot.allowed_domains.some(a =>
      domainMatches(originDomain, a)
    );

    if (!domainAllowed && !(isDev && isLocalhost(originDomain))) {
      return res.status(403).json({ error: "Dominio no permitido" });
    }

    res.sendFile(path.join(__dirname, "../public/views/views"));

  } catch (error) {
    console.error("Error serveWidget:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
};


/* =======================================================
   1) GET INSTALL SCRIPT  → /:public_id/install
======================================================= */
exports.getInstallScript = async (req, res) => {
  try {
    const chatbot = await Chatbot.findOne({ public_id: req.params.publicId });

    if (!chatbot) {
      return res.status(404).json({ error: "Chatbot no encontrado" });
    }

    if (!req.query.t || req.query.t !== chatbot.install_token) {
      return res.status(403).json({ error: "Token inválido" });
    }

    const rawOrigin = req.headers.origin || req.headers.referer || "";
    const domain = normalizeDomain(rawOrigin);

    const isProd = process.env.NODE_ENV === "production";
    const isDev = !isProd;

    const allowed =
      chatbot.allowed_domains.some(d => domainMatches(domain, d)) ||
      (isDev && isLocalhost(domain));

    if (!allowed) {
      return res.status(403).json({ error: "Dominio no autorizado" });
    }

    const baseUrl = getBaseUrl();

    const script = `
      (function(){
        var s = document.createElement('script');
        s.src = '${baseUrl}/api/chatbot-integration/widget/${chatbot.public_id}?t=${chatbot.install_token}';
        s.async = true;
        document.body.appendChild(s);
      })();
    `;

    res.setHeader("Content-Type", "application/javascript");
    res.send(script);

  } catch (error) {
    console.error("Error getInstallScript:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
};




/* =======================================================
   3) RENDER EMBED (HTML)
======================================================= */
exports.renderEmbed = async (req, res) => {
  try {
    const chatbot = await Chatbot.findOne({ public_id: req.params.publicId });

    if (!chatbot) {
      return res.status(404).send("Chatbot no encontrado");
    }

    const isProd = process.env.NODE_ENV === "production";
    const allowLocalhost = !isProd;

    let allowedOrigins = [];

    chatbot.allowed_domains.forEach(domain => {
      const clean = normalizeDomain(domain);
      if (!clean) return;

      allowedOrigins.push(`https://${clean}`);
      allowedOrigins.push(`https://*.${clean}`);

      if (allowLocalhost && isLocalhost(clean)) {
        allowedOrigins.push(`http://${clean}`);
        allowedOrigins.push(`http://${clean}:*`);
      }
    });

    const backendHost = normalizeDomain(process.env.APP_DOMAIN || "");

    allowedOrigins = allowedOrigins.filter(origin => {
      if (!backendHost) return true;
      return !origin.includes(backendHost);
    });

    const frameAncestors =
      allowedOrigins.length > 0
        ? allowedOrigins.join(" ")
        : "'none'";

    res.setHeader(
      "Content-Security-Policy",
      `frame-ancestors ${frameAncestors}`
    );

    res.render("embed", {
      chatbot,
      primaryColor: chatbot.primary_color || "#2563eb",
      secondaryColor: chatbot.secondary_color || "#111827",
      avatarUrl: chatbot.avatar_url || "",
      welcomeMessage: chatbot.welcome_message || "",
      position: chatbot.position || "bottom-right"
    });

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

    if (!domain) {
      return res.status(400).json({ error: "Dominio inválido" });
    }

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
