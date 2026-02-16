const express = require("express");
const cors = require("cors");
const path = require("path");
const app = express();

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
app.use("/api/auth", require("./routes/router-users/auth.routes.js"));
app.use("/api/public-chatbot", require("./routes/router-chatbots/public-chatbot.routes.js"));

// ───────── RUTAS PRIVADAS ─────────
app.use("/api/accounts", require("./routes/account.routes.js"));
app.use("/api/users", require("./routes/user.routes.js"));
app.use("/api/admin", require("./routes/router-users/admin.routes.js"));

app.use("/api/chatbots", require("./routes/router-chatbots/chatbots.routes.js"));
app.use("/api/chatbot-integration",require("./routes/router-chatbots/chatbotIntegration.routes.js"));
app.use("/api/flows", require("./routes/router-chatbots/router-flows/flows.routes.js"));
app.use("/api/flownodes", require("./routes/router-chatbots/router-flows/flow.nodes.routes.js"));

app.use("/api/crm-fields", require("./routes/crmfields.routes"));
app.use("/api/validation-rule",require("./routes/validationRule.routes.js"))
app.use("/api/meta", require("./routes/meta.routes.js"));
app.use("/api/conversations",require("./routes/router-chatbots/conversationSession.routes.js"));

app.use("/public", express.static(path.join(__dirname, "public")));

// ───────── ERROR HANDLERS (AL FINAL SIEMPRE) ─────────
app.use(require("./middlewares/multerError.middleware.js"));

app.use((err, req, res, next) => {
  console.error("GLOBAL ERROR:", err);
  res.status(err.status || 400).json({
    message: err.message || "Error interno del servidor"
  });
});

module.exports = app;
