exports.parseOrigin = originHeader => {
  try {
    if (!originHeader) return null;

    const url = new URL(originHeader);

    return {
      protocol: url.protocol,     // http:
      hostname: url.hostname,     // localhost
      port: url.port || null      // 5173 | 3000 | null
    };
  } catch {
    return null;
  }
};