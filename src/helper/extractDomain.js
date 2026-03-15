const { normalizeDomain } = require("../utils/normalizeDomain");
/**
 * Extrae el dominio del request de forma segura.
 * Prioriza Origin (más difícil de falsificar en navegadores) sobre Referer.
 */
function extractDomain(req) {
    const raw = req.headers.origin || req.headers.referer || "";
    const domain = normalizeDomain(raw);
    if (domain) return domain;
    if (process.env.NODE_ENV === "development") return "localhost";
    return null;
}

module.exports = { extractDomain };