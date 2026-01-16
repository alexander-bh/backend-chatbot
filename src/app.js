const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/ping", (req, res) => {
  res.json({ ok: true });
});

app.use("/test", require("./test/test-db.js"));
app.use("/test-chatbot", require("./test/test.chatbot.routes.js"));

module.exports = app;