const router = require("express").Router();
const connectDB = require("../config/database");

router.get("/", async (req, res) => {
  try {
    await connectDB();
    return res.json({ status: "Activo" });
  } catch (error) {
    console.error("ERROR EN /test:", error.message);
    return res.status(500).json({
      error: "DB connection failed",
      message: error.message
    });
  }
});

module.exports = router;
