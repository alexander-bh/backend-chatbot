const jwt = require("jsonwebtoken");
const Token = require("../models/Token");

module.exports = async (req, res, next) => {

  console.log("----- AUTH MIDDLEWARE -----");

  const authHeader = req.headers.authorization;
  console.log("Authorization header:", authHeader?.slice(0, 25) + "...");

  if (!authHeader?.startsWith("Bearer ")) {
    console.log("❌ No Bearer token");
    return res.status(401).json({ message: "Token requerido" });
  }

  const token = authHeader.split(" ")[1].trim();
  console.log("Token recibido:", token.slice(0, 20) + "...");

  try {

    const exists = await Token.findOne({
      token,
      expires_at: { $gt: new Date() }
    });

    console.log("Token encontrado en DB:", exists ? "SI" : "NO");

    if (!exists) {
      console.log("❌ Token no existe o expirado");
      return res.status(401).json({ message: "Token inválido o expirado" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    console.log("Usuario autenticado:", decoded.id);

    req.user = decoded;
    req.token = token;

    next();

  } catch (error) {

    console.log("❌ Error JWT:", error.message);
    return res.status(401).json({ message: "Token inválido" });

  }
};