const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/ping", (req, res) => {
  res.json({ ok: true });
});

//prueba de rutas
app.use("/test", require("./test/test-db.js"));
app.use("/test-chatbot", require("./test/test.chatbot.routes.js"));
app.use("/test-user", require("./test/test.user.routes.js"));

//rutas principales
app.use("/chatbots", require("./routes/chatbots.routes.js"));

module.exports = app;