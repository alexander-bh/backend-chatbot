// utils/isValidDomain.js
module.exports = function isValidDomain(domain) {
  if (!domain) return false;

  // Permite dominios y subdominios
  const regex =
    /^(localhost|(\*\.)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,})$/;

  return regex.test(domain);
};
