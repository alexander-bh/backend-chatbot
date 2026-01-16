const router = require("express").Router();
const connectDB = require("../config/database"); 
const User = require("../models/User");

router.get("/", async (req, res) => {
  try {
   
    await connectDB();

    
    const users = await User.find().lean();

    res.json({
      success: true,
      total: users.length,
      data: users
    });
  } catch (error) {
    console.error("❌ ERROR REAL:", error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;