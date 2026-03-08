const jwt = require("jsonwebtoken");

exports.generateToken = (payload) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET no definida");
  }

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: "1d"
  });
};
