const axios = require("axios");
const { sendConversationEmail } = require("../services/email.service");

const VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN; 
const WA_TOKEN    = process.env.WA_TOKEN;         
const PHONE_ID    = process.env.WA_PHONE_ID;

// ── GET: Meta verifica el webhook ──────────────────────────────────
exports.verifyWebhook = (req, res) => {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verificado");
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
};

// ── POST: llegan mensajes de WhatsApp ──────────────────────────────
exports.receiveMessage = async (req, res) => {
  try {
    const body = req.body;
    if (body.object !== "whatsapp_business_account") return res.sendStatus(404);

    const entry    = body.entry?.[0];
    const change   = entry?.changes?.[0]?.value;
    const message  = change?.messages?.[0];
    if (!message || message.type !== "text") return res.sendStatus(200);

    const from = message.from;          // número del usuario
    const text = message.text?.body;
    const name = change.contacts?.[0]?.profile?.name || "Desconocido";

    console.log(`📩 Mensaje de ${name} (${from}): ${text}`);

    // ── Construir sesión compatible con tu sendConversationEmail ──
    const session = {
      chatbot_id: process.env.DEFAULT_CHATBOT_ID, // o detectar por número
      origin_url: "WhatsApp",
      variables: { name, phone: from },
      history: [{ question: text, answer: "" }],
    };

    // Guardar + notificar por email (tu función existente)
    await sendConversationEmail(session);

    // ── Respuesta automática al usuario ───────────────────────────
    await sendWhatsAppMessage(from, `Hola ${name}, recibimos tu mensaje. Un asesor te contactará pronto.`);

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error en webhook WhatsApp:", err);
    res.sendStatus(500);
  }
};

// ── Helper: enviar mensaje por WhatsApp ───────────────────────────
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