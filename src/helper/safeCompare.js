const crypto = require("crypto");
/**
 * Timing-safe string compare que también compara longitud.
 */
function safeCompare(a, b) {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

module.exports = { safeCompare };