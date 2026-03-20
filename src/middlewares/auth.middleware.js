const jwt = require("jsonwebtoken");
const Token = require("../models/Token");

module.exports = async (req, res, next) => {
  try {

    // SSE no puede enviar headers → acepta token por query param como fallback
    const authHeader = req.headers.authorization;
    let token;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1].trim();
    } else if (req.query.token) {
      token = req.query.token.trim();  // ← para SSE: GET /api/sse/connect?token=xxx
    }

    if (!token) {
      return res.status(401).json({ message: "Token requerido" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const exists = await Token.exists({
      token,
      expires_at: { $gt: new Date() }
    });

    if (!exists) {
      return res.status(401).json({ message: "Token inválido o expirado" });
    }

    req.user = decoded;
    req.token = token;

    next();

  } catch (error) {
    return res.status(401).json({ message: "Token inválido o expirado" });
  }
};