const crypto = require("crypto");

function generateDomainToken(installToken, domain) {
  return crypto
    .createHmac("sha256", process.env.INSTALL_SECRET)
    .update(`${installToken}:${domain.toLowerCase()}`)
    .digest("hex");
}

module.exports = { generateDomainToken };