const dns = require("dns").promises;

exports.domainExists = async (domain) => {
  try {
    const baseDomain = domain.startsWith("*.")
      ? domain.slice(2)
      : domain;

    await dns.lookup(baseDomain);
    return true;
  } catch {
    return false;
  }
};