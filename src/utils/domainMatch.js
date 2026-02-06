/**
 * Compara dominio exacto o subdominio permitido
 * @param {string} origin - dominio detectado
 * @param {string} allowed - dominio permitido
 */
module.exports.domainMatches = (origin, allowed) => {
  if (!origin || !allowed) return false;

  if (origin === allowed) return true;

  return origin.endsWith(`.${allowed}`);
};
