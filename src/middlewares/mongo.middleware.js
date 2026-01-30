const connectDB = require("../config/database");

module.exports = async function mongoMiddleware(req, res, next) {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error("Mongo middleware error:", error);
    res.status(500).json({
      message: "Error de conexión a base de datos"
    });
  }
};
