const { domainMatches } = require("../utils/domainMatch");
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

module.exports = isDomainAllowed;