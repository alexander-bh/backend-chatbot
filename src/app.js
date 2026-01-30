const express = require("express");
const cors = require("cors");

const resolveAccount = require("./middlewares/resolveAccount");

const app = express();

app.use(cors());
app.use(express.json());

// health
app.get("/ping", (req, res) => {
  res.json({ ok: true });
});

// middlewares globales
app.use(require("./middlewares/multerError.middleware"));
app.use(require("./middlewares/mongo.middleware.js"));

/* ───────── RUTAS PÚBLICAS ───────── */
// NO account
app.use("/api/auth", require("./routes/auth.routes.js"));
app.use("/api/public-chatbot", require("./routes/public-chatbot.routes.js"));

/* ───────── RUTAS CON CUENTA ───────── */
app.use(resolveAccount);

// cuenta / usuarios
app.use("/api/accounts", require("./routes/account.routes.js"));
app.use("/api/users", require("./routes/user.routes.js"));
app.use("/api/admin", require("./routes/admin.routes.js"));

// chatbots
app.use("/api/chatbots", require("./routes/chatbots.routes.js"));
app.use("/api/flows", require("./routes/flows.routes.js"));
app.use("/api/flownodes", require("./routes/flow.nodes.routes.js"));

// CRM
app.use("/api/crm-fields", require("./routes/crmfields.routes"));
app.use("/api/meta", require("./routes/meta.routes.js"));

// conversaciones
app.use("/api/conversations", require("./routes/conversationSession.routes.js"));

module.exports = app;
