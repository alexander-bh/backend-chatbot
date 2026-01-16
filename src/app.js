const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/ping", (req, res) => {
  res.json({ ok: true });
});

// 👇 AGREGA SOLO ESTA
app.use("/test", require("./test/test.routes"));

module.exports = app;