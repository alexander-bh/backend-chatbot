// middlewares/publicRateLimit.js
const rateLimit = require("express-rate-limit");

module.exports = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false
});

const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5
});

module.exports = forgotLimiter; 