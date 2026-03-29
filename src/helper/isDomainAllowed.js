const { domainMatches } = require("../utils/domainMatch");
function isDomainAllowed(chatbot, domain) {
  if (!chatbot.allowed_domains?.length) return false;
  const inAllowList = chatbot.allowed_domains.some(d => domainMatches(domain, d));
  if (inAllowList) return true;
  return false;
}
module.exports = isDomainAllowed;
