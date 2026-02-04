const LOCALHOST_DOMAINS = [
    "localhost",
    "127.0.0.1",
    "::1"
];

exports.isLocalhost = domain => {
    domain === "localhost" ||
        domain === "127.0.0.1" ||
        domain === "::1";
    return LOCALHOST_DOMAINS.includes(domain);
};

exports.isDomainAllowed = (domain, allowedDomains = []) => {
    if (!domain || !allowedDomains.length) return false;

    const normalizedDomain = domain.replace(/^www\./, "").toLowerCase();

    return allowedDomains.some(allowed => {
        const normalizedAllowed = allowed
            .replace(/^www\./, "")
            .toLowerCase();

        // Coincidencia exacta
        if (normalizedDomain === normalizedAllowed) {
            return true;
        }

        // Subdominios con wildcard (*.example.com)
        if (normalizedAllowed.startsWith("*.")) {
            const baseDomain = normalizedAllowed.slice(2);

            return (
                normalizedDomain === baseDomain ||
                normalizedDomain.endsWith(`.${baseDomain}`)
            );
        }

        return false;
    });
};
