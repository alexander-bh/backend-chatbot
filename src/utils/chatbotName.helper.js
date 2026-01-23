const Chatbot = require("../models/Chatbot");

const COPY_WORD = "Copia";

// Limpia "(Copia)" o "(Copia 2)" del nombre
function getBaseName(name) {
    return name.replace(/\s*\(${COPY_WORD}(?:\s*\d+)?\)$/i, "").trim();
}

// Genera el siguiente nombre disponible
async function generateCopyName(baseName, accountId, session) {
  const escaped = baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // SOLO copias numeradas
  const regex = new RegExp(
    `^${escaped} \\(${COPY_WORD}(?: (\\d+))?\\)$`,
    "i"
  );

  const existing = await Chatbot.find({
    account_id: accountId,
    name: { $regex: regex }
  }).session(session);

  if (existing.length === 0) {
    return `${baseName} (${COPY_WORD})`;
  }

  let max = 0;

  for (const bot of existing) {
    const match = bot.name.match(/\(${COPY_WORD}(?: (\d+))?\)$/i);
    if (!match) continue;
    const num = match[1] ? parseInt(match[1]) : 1;
    max = Math.max(max, num);
  }

  return `${baseName} (${COPY_WORD} ${max + 1})`;
}


module.exports = {
    getBaseName,
    generateCopyName
};
