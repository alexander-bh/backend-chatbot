const express = require("express");
const cors = require("cors");
const { resolveAccount } = require("./middlewares/resolveAccount");

const app = express(); // ✅ ESTO FALTABA

// ───────── MIDDLEWARES NORMALES ─────────
app.use(cors());
app.use(express.json());

// health
app.get("/ping", (req, res) => {
  res.json({ ok: true });
});

// mongo (middleware normal)
app.use(require("./middlewares/mongo.middleware.js"));

// ───────── RUTAS PÚBLICAS ─────────
app.use("/api/auth", require("./routes/auth.routes.js"));
app.use("/api/public-chatbot", require("./routes/public-chatbot.routes.js"));

// ───────── RUTAS PRIVADAS ─────────
app.use("/api/accounts", resolveAccount, require("./routes/account.routes.js"));
app.use("/api/users", resolveAccount, require("./routes/user.routes.js"));
app.use("/api/admin", resolveAccount, require("./routes/admin.routes.js"));

app.use("/api/chatbots", resolveAccount, require("./routes/chatbots.routes.js"));
app.use("/api/flows", resolveAccount, require("./routes/flows.routes.js"));
app.use("/api/flownodes", resolveAccount, require("./routes/flow.nodes.routes.js"));

app.use("/api/crm-fields", resolveAccount, require("./routes/crmfields.routes"));
app.use("/api/meta", resolveAccount, require("./routes/meta.routes.js"));

app.use(
  "/api/conversations",
  resolveAccount,
  require("./routes/conversationSession.routes.js")
);

// ───────── ERROR HANDLERS (AL FINAL SIEMPRE) ─────────
app.use(require("./middlewares/multerError.middleware.js"));

app.use((err, req, res, next) => {
  console.error("GLOBAL ERROR:", err);
  res.status(err.status || 400).json({
    message: err.message || "Error interno del servidor"
  });
});


module.exports = app;
