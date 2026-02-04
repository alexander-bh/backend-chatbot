const jwt = require("jsonwebtoken");
const Token = require("../models/Token");

module.exports = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token requerido" });
  }

  const token = authHeader.split(" ")[1].trim();

  try {
    const exists = await Token.findOne({
      token,
      expires_at: { $gt: new Date() }
    });

    if (!exists) {
      return res.status(401).json({ message: "Token inválido o expirado" });
    }

    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: "Token inválido" });
  }
};
