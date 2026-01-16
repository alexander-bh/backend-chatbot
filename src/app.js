const express = require("express");
const app = express();

app.get("/api/test", (req, res) => {
  res.json({ ok: true });
});

module.exports = app;
