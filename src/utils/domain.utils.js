function normalizeDomain(domain = "") {
  try {
    const url = new URL(domain.startsWith("http") ? domain : `https://${domain}`);
    return url.hostname.toLowerCase();
  } catch (err) {
    return domain
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "")
      .toLowerCase();
  }
}

module.exports = { normalizeDomain };
