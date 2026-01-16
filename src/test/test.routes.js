/*const router = require("express").Router();
const User = require("../models/User");

router.get("/users", async (req, res) => {
  const users = await User.find();
  res.json(users);
});

module.exports = router;*/

const router = require("express").Router();

router.get("/", (req, res) => {
  res.json({ ok: true });
});

module.exports = router;