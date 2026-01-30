const express = require("express");
const cors = require("cors");
const { resolveAccount } = require("./middlewares/resolveAccount");

const app = express();

app.use(cors());
app.use(express.json());

// health
app.get("/ping", (req, res) => {
  res.json({ ok: true });
});

// middlewares 
app.use(require("./middlewares/mongo.middleware.js"));

/* ───────── RUTAS PÚBLICAS (NO requieren cuenta) ───────── */

// auth (registro inicial, login, etc)
app.use("/api/auth", require("./routes/auth.routes.js"));

// chatbot público
app.use("/api/public-chatbot", require("./routes/public-chatbot.routes.js"));

/* ───────── RUTAS PRIVADAS (requieren cuenta) ───────── */

// cuentas y usuarios
app.use("/api/accounts", resolveAccount, require("./routes/account.routes.js"));
app.use("/api/users", resolveAccount, require("./routes/user.routes.js"));
app.use("/api/admin", resolveAccount, require("./routes/admin.routes.js"));

// chatbots y flujos
app.use("/api/chatbots", resolveAccount, require("./routes/chatbots.routes.js"));
app.use("/api/flows", resolveAccount, require("./routes/flows.routes.js"));
app.use("/api/flownodes", resolveAccount, require("./routes/flow.nodes.routes.js"));

// CRM
app.use("/api/crm-fields", resolveAccount, require("./routes/crmfields.routes"));
app.use("/api/meta", resolveAccount, require("./routes/meta.routes.js"));

// conversaciones
app.use(
  "/api/conversations",
  resolveAccount,
  require("./routes/conversationSession.routes.js")
);

// middlewares 
app.use(require("./middlewares/multerError.middleware"));

module.exports = app;
