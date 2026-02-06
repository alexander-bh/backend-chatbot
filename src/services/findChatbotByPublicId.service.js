const Chatbot = require("../models/Chatbot");
const crypto = require("crypto");

/**
 * Busca un chatbot por public_id y account_id
 * Se usa para validar propiedad del chatbot
 */
module.exports = async function findChatbotByPublicId(publicId, accountId) {
  if (!publicId || !accountId) return null;

  const chatbot = await Chatbot.findOne({
    public_id: publicId,
    account_id: accountId,
    status: "active"
  });

  // ✅ Genera install_token si no existe
  if (chatbot && !chatbot.install_token) {
    chatbot.install_token = crypto.randomBytes(24).toString("hex");
    await chatbot.save();
  }

  return chatbot;
};