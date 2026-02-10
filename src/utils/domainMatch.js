/**
 * Compara dominio exacto o subdominio permitido (con soporte wildcard)
 * @param {string} origin - dominio detectado (ej: blog.midominio.com)
 * @param {string} allowed - dominio permitido (ej: midominio.com o *.midominio.com)
 */
module.exports.domainMatches = (origin, allowed) => {
  if (!origin || !allowed) return false;

  origin = origin.toLowerCase();
  allowed = allowed.toLowerCase();

  // Wildcard *.midominio.com
  if (allowed.startsWith("*.")) {
    const base = allowed.slice(2);

    return (
      origin === base ||
      origin.endsWith(`.${base}`)
    );
  }

  // Dominio exacto
  if (origin === allowed) return true;

  // Subdominio REAL (evita evil-midominio.com)
  return origin.endsWith(`.${allowed}`);
};