const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const generateToken = (payload) => {
  return jwt.sign(
    {
      ...payload,
      jti: crypto.randomUUID() // hace el token único
    },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );
};

module.exports = generateToken;