const LOCALHOST_DOMAINS = [
  "localhost",
  "127.0.0.1",
  "::1"
];

exports.isLocalhost = domain => {
  return LOCALHOST_DOMAINS.includes(domain);
};
