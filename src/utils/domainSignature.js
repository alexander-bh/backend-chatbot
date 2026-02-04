// utils/domainSignature
const crypto = require("crypto");

exports.signDomain = (domain, chatbotId, token, window) => {
  return crypto
    .createHmac("sha256", process.env.DOMAIN_SIGNATURE_SECRET)
    .update(`${domain}|${chatbotId}|${token}|${window}`)
    .digest("hex");
};
    