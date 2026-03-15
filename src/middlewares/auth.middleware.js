const jwt = require("jsonwebtoken");
const Token = require("../models/Token");

module.exports = async (req, res, next) => {
  try {

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Token requerido" });
    }

    const token = authHeader.split(" ")[1].trim();

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