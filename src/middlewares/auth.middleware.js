const jwt = require("jsonwebtoken");
const Token = require("../models/Token");

module.exports = async (req, res, next) => {
  const auth = req.headers.authorization;

  if (!auth || !auth.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token requerido" });
  }

  const token = auth.split(" ")[1].trim();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const exists = await Token.findOne({
      token,
      expires_at: { $gt: new Date() }
    });

    if (!exists) {
      return res.status(401).json({ message: "Token inválido o expirado" });
    }

    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: "Token inválido" });
  }
};
