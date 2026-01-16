const router = require("express").Router();
const connectDB = require("../config/database");
const User = require("../models/User");

router.get("/", async (req, res) => {
  try {
    await connectDB();

    const users = await User.find().select("-__v");

    res.json({
      success: true,
      total: users.length,
      data: users
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Error al obtener usuarios"
    });
  }
});

module.exports = router;