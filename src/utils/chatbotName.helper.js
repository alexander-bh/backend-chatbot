const Chatbot = require("../models/Chatbot");

const COPY_WORD = "Copia";

// Limpia "(Copia)" o "(Copia 2)" del nombre
function getBaseName(name) {
    return name.replace(/\s*\(${COPY_WORD}(?:\s*\d+)?\)$/i, "").trim();
}

// Genera el siguiente nombre disponible
async function generateCopyName(baseName, accountId, session) {
    const escaped = baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`^${escaped}( \\(${COPY_WORD}( \\d+)?\\))?$`, "i");

    const existing = await Chatbot.find({
        account_id: accountId,
        name: { $regex: regex }
    }).session(session);

    if (!existing.length) {
        return `${baseName} (${COPY_WORD})`;
    }

    const numbers = existing.map(c => {
        const match = c.name.match(/\(${COPY_WORD} (\d+)\)$/i);
        return match ? parseInt(match[1]) : 1;
    });

    const next = Math.max(...numbers) + 1;
    return `${baseName} (${COPY_WORD} ${next})`;
}

module.exports = {
    getBaseName,
    generateCopyName
};
