const axios = require("axios");
const Chatbot = require("../models/Chatbot");
const SystemConfig = require("../models/SystemConfig");

const WA_TOKEN = process.env.WA_TOKEN;
const PHONE_ID = process.env.WA_PHONE_ID;

exports.sendConversationWhatsApp = async (session) => {
    try {

        /* ═══════════════════════════════════════════
           1. CONSTRUIR MENSAJE
        ═══════════════════════════════════════════ */

        const vars = session.variables || {};
        const history = session.history || [];
        const originUrl = session.origin_url || "Desconocido";

        const nombre = [vars.name, vars.last_name].filter(Boolean).join(" ") || "Sin nombre";
        const email = vars.email || "—";
        const phone = vars.phone || "—";

        const resumen = history
            .slice(-10)
            .map((h, i) => `${i + 1}. ❓ ${h.question}\n   💬 ${h.answer}`)
            .join("\n\n");

        const mensaje =
            `🤖 *Nuevo contacto registrado*\n\n` +
            `👤 *Nombre:* ${nombre}\n` +
            `📧 *Email:* ${email}\n` +
            `📞 *Teléfono:* ${phone}\n` +
            `🌐 *Origen:* ${originUrl}\n\n` +
            `📋 *Resumen de conversación:*\n${resumen || "Sin historial"}`;

        /* ═══════════════════════════════════════════
           2. DESTINATARIOS
        ═══════════════════════════════════════════ */

        const destinatarios = new Set();

        // ── A) Número global del admin (whatsapp_notify) ──────────────
        try {
            const sysConfig = await SystemConfig
                .findOne({ key: "whatsapp_notify" })
                .lean();

            if (sysConfig?.value) {
                destinatarios.add(normalizePhone(sysConfig.value));
            }

        } catch (err) {
            console.error("❌ Error leyendo whatsapp_notify:", err);
        }

        // ── B) Números del chatbot ───────────────────
        if (session.chatbot_id) {

            try {

                const chatbot = await Chatbot.findById(session.chatbot_id)
                    .select("phone_settings")
                    .lean();

                const ps = chatbot?.phone_settings;

                if (ps?.enabled && Array.isArray(ps?.phone_numbers)) {

                    for (const num of ps.phone_numbers) {

                        const clean = normalizePhone(num);

                        if (clean.length >= 10) {
                            destinatarios.add(clean);
                        }

                    }

                }

            } catch (err) {
                console.error("❌ Error leyendo phone_settings:", err);
            }

        }

        /* ═══════════════════════════════════════════
           3. ENVIAR MENSAJES
        ═══════════════════════════════════════════ */

        if (destinatarios.size === 0) return;

        if (!WA_TOKEN || !PHONE_ID) {
            console.warn("⚠️ WA_TOKEN o WA_PHONE_ID no configurados");
            return;
        }

        const envios = [...destinatarios].map(numero =>
            sendWhatsAppMessage(numero, mensaje).catch(err =>
                console.error(`❌ Error enviando WA a ${numero}:`, err.response?.data || err.message)
            )
        );

        await Promise.allSettled(envios);

    } catch (err) {

        console.error("❌ sendConversationWhatsApp error:", err);

    }
};


/* ─────────────────────────────────────────────
   HELPER: enviar mensaje WhatsApp
───────────────────────────────────────────── */

async function sendWhatsAppMessage(to, text) {

    await axios.post(
        `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
        {
            messaging_product: "whatsapp",
            to,
            type: "text",
            text: { body: text },
        },
        {
            headers: {
                Authorization: `Bearer ${WA_TOKEN}`,
                "Content-Type": "application/json",
            },
        }
    );

}

/* ─────────────────────────────────────────────
   HELPER: limpiar número
───────────────────────────────────────────── */

function normalizePhone(raw) {
    return String(raw).replace(/\D/g, "");
}