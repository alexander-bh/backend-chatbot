// utils/domain.utils.js
// utils/domain.utils.js
function normalizeDomain(input = "") {
  try {
    if (!input || typeof input !== "string") return null;

    const hasWildcard = input.startsWith("*.");
    const cleanInput = hasWildcard ? input.slice(2) : input;

    const url = new URL(
      cleanInput.startsWith("http")
        ? cleanInput
        : `https://${cleanInput}`
    );

    let hostname = url.hostname.toLowerCase();
    hostname = hostname.replace(/^www\./, "");

    // ✅ PERMITIR LOCALHOST EXPLÍCITAMENTE
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1"
    ) {
      return hostname;
    }

    const domainRegex =
      /^(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,}$/;

    if (!domainRegex.test(hostname)) {
      return null;
    }

    return hasWildcard ? `*.${hostname}` : hostname;
  } catch {
    return null;
  }
}

module.exports = { normalizeDomain };


/*function normalizeDomain(input = "") {
  try {
    if (!input || typeof input !== "string") return null;

    const hasWildcard = input.startsWith("*.");
    const cleanInput = hasWildcard ? input.slice(2) : input;

    // 👉 permitir localhost explícitamente
    if (
      cleanInput === "localhost" ||
      cleanInput === "127.0.0.1" ||
      cleanInput === "::1"
    ) {
      return cleanInput;
    }

    const url = new URL(
      cleanInput.startsWith("http")
        ? cleanInput
        : `https://${cleanInput}`
    );

    let hostname = url.hostname.toLowerCase();
    hostname = hostname.replace(/^www\./, "");

    const domainRegex =
      /^(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,}$/;

    if (!domainRegex.test(hostname)) {
      return null;
    }

    return hasWildcard ? `*.${hostname}` : hostname;
  } catch {
    return null;
  }
}

module.exports = { normalizeDomain };*/