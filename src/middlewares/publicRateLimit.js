// middlewares/publicRateLimit.js
const rateLimit = require("express-rate-limit");

// Limiter general para endpoints públicos (60 req/min)
const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false
});

// Limiter estricto para el endpoint /challenge (20 req/min)
const challengeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false
});

// Limiter para forgot-password (5 req cada 15 min)
const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = { publicLimiter, challengeLimiter, forgotLimiter };