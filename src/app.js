const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());


//ruta de prueba
app.get("/ping", (req, res) => {
  res.json({ ok: true });
});


//prueba de rutas
//app.use("/test", require("./test/test-db.js"));
//app.use("/test-chatbot", require("./test/test.chatbot.routes.js"));
//app.use("/test-user", require("./test/test.user.routes.js"));
app.use(require("./middlewares/multerError.middleware"));

//rutas principales
app.use("/api/chatbots", require("./routes/chatbots.routes.js"));
app.use("/api/chatbot-settings", require("./routes/chatbotSettings.routes.js"));
app.use("/api/users", require("./routes/user.routes.js"));
app.use("/api/auth", require("./routes/auth.routes.js"));
app.use("/api/admin", require("./routes/admin.routes.js"));
app.use("/api/flows", require("./routes/flows.routes.js"));
app.use("/api/flownodes", require("./routes/flow.nodes.routes.js"));  

module.exports = app;