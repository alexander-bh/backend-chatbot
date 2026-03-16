const { domainMatches } = require("../utils/domainMatch");

function isDomainAllowed(chatbot, domain) {
  if (!chatbot.allowed_domains?.length) return false;

  // Verificar siempre contra allowed_domains — sin excepciones automáticas
  const inAllowList = chatbot.allowed_domains.some(d => domainMatches(domain, d));
  if (inAllowList) return true;

  // localhost solo permitido si está explícitamente en allowed_domains
  // (la línea anterior ya lo cubre — esta nota es intencional)
  return false;
}

module.exports = isDomainAllowed;

/*const { domainMatches } = require("../utils/domainMatch");
const { isLocalhost } = require("../utils/isLocalhost");
const { normalizeDomain } = require("../utils/normalizeDomain");

const WIDGET_BASE_URL =
  process.env.WIDGET_BASE_URL ||
  "https://chatbot-widget-blue-eight.vercel.app";

const WIDGET_DOMAIN = normalizeDomain(WIDGET_BASE_URL);

function isDomainAllowed(chatbot, domain) {
  const allowLocalhost = process.env.NODE_ENV === "development";

  return (
    chatbot.allowed_domains?.some(d => domainMatches(domain, d)) ||
    domainMatches(domain, WIDGET_DOMAIN) ||
    (allowLocalhost && isLocalhost(domain))
  );
}

module.exports = isDomainAllowed;*/