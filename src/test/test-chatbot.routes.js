const router = require("express").Router();
const connectDB = require("../config/database");
const Chatbot = require("../models/Chatbot");

router.get("/", async (req, res) => {
  try {
    await connectDB();

    const chatbots = await Chatbot.find().lean();

    res.json({
      success: true,
      total: chatbots.length,
      data: chatbots
    });
  } catch (error) {
    console.error("ERROR CHATBOTS:", error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
