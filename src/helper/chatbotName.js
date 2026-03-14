const Chatbot = require("../models/Chatbot");

const COPY_WORD = "Copia";

// Limpia CUALQUIER sufijo de copia anidado, ej: "Alexander (Copia 1) (Copia)" → "Alexander"
function getBaseName(name) {
  // Remueve repetidamente el sufijo hasta que no haya más
  let result = name;
  const suffixRegex = new RegExp(`\\s*\\(${COPY_WORD}(?:\\s*\\d+)?\\)$`, "i");
  while (suffixRegex.test(result)) {
    result = result.replace(suffixRegex, "").trim();
  }
  return result;
}

// Genera el siguiente nombre disponible basado en el nombre ORIGINAL (sin copias)
async function generateCopyName(baseName, accountId, session) {
  const escaped = baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const regex = new RegExp(
    `^${escaped} \\(${COPY_WORD}(?:\\s*(\\d+))?\\)$`,
    "i"
  );

  const existing = await Chatbot.find({
    account_id: accountId,
    name: { $regex: regex },
  }).session(session);

  if (existing.length === 0) {
    return `${baseName} (${COPY_WORD})`;
  }

  let max = 0;

  for (const bot of existing) {
    const match = bot.name.match(
      new RegExp(`\\(${COPY_WORD}(?:\\s*(\\d+))?\\)$`, "i")
    );
    if (!match) continue;
    const num = match[1] ? parseInt(match[1]) : 1;
    max = Math.max(max, num);
  }

  return `${baseName} (${COPY_WORD} ${max + 1})`;
}

module.exports = {
  getBaseName,
  generateCopyName,
};