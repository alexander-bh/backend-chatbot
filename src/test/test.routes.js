const router = require("express").Router();
const connectDB = require("../config/db");

router.get("/", async (req, res) => {
  try {
    await connectDB();
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
