/**
 * Compara dominio exacto o subdominio permitido (con soporte wildcard)
 * @param {string} origin - dominio detectado (ej: blog.midominio.com)
 * @param {string} allowed - dominio permitido (ej: midominio.com o *.midominio.com)
 */
module.exports.domainMatches = (origin, allowed) => {
  if (!origin || !allowed) return false;

  origin = origin.toLowerCase();
  allowed = allowed.toLowerCase();

  const localAliases = ["localhost", "127.0.0.1", "::1"];

  if (
    localAliases.includes(origin) &&
    localAliases.includes(allowed)
  ) {
    return true;
  }

  if (allowed.startsWith("*.")) {
    const base = allowed.slice(2);
    return origin === base || origin.endsWith(`.${base}`);
  }

  if (origin === allowed) return true;

  return origin.endsWith(`.${allowed}`);
};
