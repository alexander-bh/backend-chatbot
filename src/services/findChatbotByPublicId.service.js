const Chatbot = require("../models/Chatbot");

/**
 * Busca un chatbot por public_id y account_id
 * Se usa para validar propiedad del chatbot
 */
module.exports = async function findChatbotByPublicId(publicId, accountId) {
  if (!publicId || !accountId) return null;

  return Chatbot.findOne({
    public_id: publicId,
    account_id: accountId,
    status: "active"
  });
};
