// chatbotIntegration.controller.js — VERSION LIMPIA Y SEGURA

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const Chatbot = require("../models/Chatbot");
const isDomainAllowed = require("../helper/isDomainAllowed");
const { safeCompare } = require("../helper/safeCompare");
const { normalizeDomain } = require("../utils/normalizeDomain");
const { isLocalhost } = require("../utils/isLocalhost");
const { getStore, TTL_MS } = require("../utils/nonceStore");
const { domainExists } = require("../validators/domain.validator");

/* ─────────────────────────────────────────
   🔐 VALIDACIÓN DE VARIABLES DE ENTORNO
───────────────────────────────────────── */
const REQUIRED_ENVS = ["CONFIG_SECRET"];

REQUIRED_ENVS.forEach((env) => {
    if (!process.env[env]) {
        throw new Error(`❌ Missing environment variable: ${env}`);
    }
});

/* ───────────────────────────────────────── */
const getBaseUrl = () =>
    process.env.APP_BASE_URL || "http://localhost:3000";

const getWidgetBaseUrl = () =>
    process.env.WIDGET_BASE_URL || "http://localhost:5173";

const WIDGET_BASE_URL = getWidgetBaseUrl();
const WIDGET_DOMAIN = normalizeDomain(WIDGET_BASE_URL);

const SCRIPT_TEMPLATE = fs.readFileSync(
    path.join(__dirname, "./Installscript.template.js"),
    "utf8"
);

/* =======================================================
   1) INSTALL SCRIPT
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

        const script = SCRIPT_TEMPLATE
            .replace(/\{\{BASE_URL\}\}/g, getBaseUrl())
            .replace(/\{\{PUBLIC_ID\}\}/g, public_id)
            .replace(/\{\{POSITION\}\}/g, chatbot.position || "bottom-right")
            .replace(/\{\{SECONDARY_COLOR\}\}/g, chatbot.secondary_color || "#06070B");

        res.type("application/javascript");
        res.setHeader("Cache-Control", "no-store");
        res.send(script);

    } catch (err) {
        console.error("INSTALL SCRIPT ERROR:", err);
        res.status(500).send("// Error interno");
    }
};

/* =======================================================
   2) RENDER EMBED
======================================================= */
exports.renderEmbed = async (req, res) => {
    try {
        const { public_id } = req.params;
        const rawDomain = req.query.d || "";
        const domain = normalizeDomain(rawDomain);
        const challengeB64 = req.query.c || "";

        if (!domain) return res.status(400).send("Dominio inválido");
        if (!challengeB64) return res.status(403).send("Challenge requerido");

        let challengeData;
        try {
            challengeData = JSON.parse(
                Buffer.from(challengeB64, "base64").toString("utf8")
            );
        } catch {
            return res.status(403).send("Challenge inválido");
        }

        const { payload, sig } = challengeData;
        if (!payload || !sig) return res.status(403).send("Challenge inválido");

        const expectedSig = crypto
            .createHmac("sha256", process.env.CONFIG_SECRET)
            .update(payload)
            .digest("hex");

        if (!safeCompare(sig, expectedSig)) {
            return res.status(403).send("Firma inválida");
        }

        const parsed = JSON.parse(payload);

        if (Date.now() - parsed.ts > 120000) {
            return res.status(403).send("Challenge expirado");
        }

        if (normalizeDomain(parsed.domain) !== domain) {
            return res.status(403).send("Dominio inválido");
        }

        const chatbot = await Chatbot.findOne({
            public_id,
            status: "active",
            is_enabled: true
        }).lean();

        if (!chatbot) return res.status(404).send("Chatbot no encontrado");

        if (!isDomainAllowed(chatbot, domain)) {
            return res.status(403).send("Dominio no permitido");
        }

        const store = await getStore();
        const nonce = crypto.randomBytes(32).toString("hex");
        await store.set(nonce, TTL_MS);

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
            // ✅ Campos faltantes
            welcomeMessage: chatbot.welcome_message || "",
            welcomeDelay: chatbot.welcome_delay ?? 2,
            inputPlaceholder: chatbot.input_placeholder || "Escribe tu mensaje...",
            showBranding: chatbot.show_branding ?? true
        };

        const payloadStr = JSON.stringify(config);

        const signature = crypto
            .createHmac("sha256", process.env.CONFIG_SECRET)
            .update(payloadStr)
            .digest("hex");

        const encoded = encodeURIComponent(
            Buffer.from(JSON.stringify({ payload: payloadStr, signature })).toString("base64")
        );

        const widgetUrl = `${WIDGET_BASE_URL}/?config=${encoded}`;

        res.setHeader("Content-Type", "text/html");

        res.send(`
      <script>
        window.location.replace(${JSON.stringify(widgetUrl)});
      </script>
    `);

    } catch (err) {
        console.error("RENDER EMBED ERROR:", err);
        res.status(500).send("Error interno");
    }
};

/* =======================================================
   3) VERIFY CONFIG
======================================================= */
exports.verifyConfigSignature = async (req, res) => {
    try {
        const { payload, signature } = req.body;

        if (!payload || !signature)
            return res.status(400).json({ error: "Datos incompletos" });

        const expected = crypto
            .createHmac("sha256", process.env.CONFIG_SECRET)
            .update(payload)
            .digest("hex");

        if (!safeCompare(signature, expected))
            return res.status(403).json({ error: "Firma inválida" });

        const config = JSON.parse(payload);

        if (!config.ts || Date.now() - config.ts > 90000)
            return res.status(403).json({ error: "Expirado" });

        const store = await getStore();
        const valid = await store.consume(config.nonce);

        if (!valid)
            return res.status(403).json({ error: "Nonce inválido" });

        const { nonce, ...safeConfig } = config;
        res.json(safeConfig);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error interno" });
    }
};

/* =======================================================
   4) GET CHALLENGE
======================================================= */
exports.getChallenge = async (req, res) => {
    try {
        const { public_id } = req.params;

        const chatbot = await Chatbot.findOne({
            public_id,
            status: "active",
            is_enabled: true
        }).lean();

        if (!chatbot) return res.status(404).json({ error: "Chatbot no encontrado" });

        const domain = normalizeDomain(req.query.d || "");
        if (!domain) return res.status(400).json({ error: "Dominio requerido" });

        if (!isDomainAllowed(chatbot, domain)) {
            return res.status(403).json({ error: "Dominio no permitido" });
        }

        const payload = JSON.stringify({ domain, ts: Date.now() });

        const sig = crypto
            .createHmac("sha256", process.env.CONFIG_SECRET)
            .update(payload)
            .digest("hex");

        const challenge = Buffer.from(JSON.stringify({ payload, sig })).toString("base64");

        res.json({ challenge }); // ✅ "challenge" no "c"

    } catch (err) {
        console.error("GET CHALLENGE ERROR:", err);
        res.status(500).json({ error: "Error interno" });
    }
};

/* =======================================================
   5) ADD ALLOWED DOMAIN
======================================================= */
exports.addAllowedDomain = async (req, res) => {
    try {
        const { public_id } = req.params;
        const { domain } = req.body;

        if (!domain) return res.status(400).json({ error: "Dominio requerido" });

        const normalized = normalizeDomain(domain);
        if (!normalized) return res.status(400).json({ error: "Dominio inválido" });

        // Verificar que el dominio existe (DNS)
        const exists = await domainExists(normalized);
        if (!exists) return res.status(400).json({ error: "El dominio no existe o no es accesible" });

        const chatbot = await Chatbot.findOne({
            public_id,
            account_id: req.user.account_id  // viene del auth middleware
        });

        if (!chatbot) return res.status(404).json({ error: "Chatbot no encontrado" });

        if (chatbot.allowed_domains.includes(normalized)) {
            return res.status(409).json({ error: "El dominio ya está registrado" });
        }

        chatbot.allowed_domains.push(normalized);
        chatbot.updated_at = new Date();
        await chatbot.save();

        res.json({ ok: true, allowed_domains: chatbot.allowed_domains });

    } catch (err) {
        console.error("ADD DOMAIN ERROR:", err);
        res.status(500).json({ error: "Error interno" });
    }
};

/* =======================================================
   6) REMOVE ALLOWED DOMAIN
======================================================= */
exports.removeAllowedDomain = async (req, res) => {
    try {
        const { public_id } = req.params;
        const { domain } = req.body;

        if (!domain) return res.status(400).json({ error: "Dominio requerido" });

        const normalized = normalizeDomain(domain);
        if (!normalized) return res.status(400).json({ error: "Dominio inválido" });

        const chatbot = await Chatbot.findOne({
            public_id,
            account_id: req.user.account_id
        });

        if (!chatbot) return res.status(404).json({ error: "Chatbot no encontrado" });

        const index = chatbot.allowed_domains.indexOf(normalized);
        if (index === -1) {
            return res.status(404).json({ error: "Dominio no encontrado en la lista" });
        }

        chatbot.allowed_domains.splice(index, 1);
        chatbot.updated_at = new Date();
        await chatbot.save();

        res.json({ ok: true, allowed_domains: chatbot.allowed_domains });

    } catch (err) {
        console.error("REMOVE DOMAIN ERROR:", err);
        res.status(500).json({ error: "Error interno" });
    }
};

/* =======================================================
   7) INSTALLATION CODE
======================================================= */
exports.InstallationCode = async (req, res) => {
    try {
        const { public_id } = req.params;

        const chatbot = await Chatbot.findOne({
            public_id,
            account_id: req.user.account_id
        }).lean();

        if (!chatbot) return res.status(404).json({ error: "Chatbot no encontrado" });

        const scriptUrl = `${getBaseUrl()}/api/chatbot-integration/${public_id}/install`;

        const snippet = `<script src='${scriptUrl}' async></script>`;

        res.json({
            scripts: [{ script: snippet }],
            allowed_domains: chatbot.allowed_domains || []
        });

    } catch (err) {
        console.error("INSTALLATION CODE ERROR:", err);
        res.status(500).json({ error: "Error interno" });
    }
};