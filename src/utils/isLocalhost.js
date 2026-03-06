const LOCALHOST_DOMAINS = [
  "localhost",
  "127.0.0.1",
  "::1"
];

exports.isLocalhost = domain => {
  if (!domain) return false;
  const host = domain.split(":")[0];
  return LOCALHOST_DOMAINS.includes(host);
};