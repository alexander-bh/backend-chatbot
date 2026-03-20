const express = require("express");
const cors = require("cors");
const app = express();

// ───────── MIDDLEWARES NORMALES ─────────
app.use(cors());
app.use(express.json());
app.set("trust proxy", 1);

// favicon
app.get("/favicon.ico", (req, res) => res.status(204).end());
app.get("/favicon.png", (req, res) => res.status(204).end());

// root
app.get("/", (req, res) => {
  res.json({
    service: "Chatbot Backend API",
    status: "running"
  });
});

// health
app.get("/ping", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: Date.now()
  });
});

// mongo (middleware normal)
app.use(require("./middlewares/mongo.middleware.js"));

// ───────── RUTAS PÚBLICAS ─────────
app.use("/api/auth", require("./routes/auth.routes.js"));
app.use("/api/public-chatbot", require("./routes/public-chatbot.routes.js"));
app.use("/api/conversations",require("./routes/conversationSession.routes.js"));
app.use("/api/notifications",require("./routes/notification.routes.js"));
app.use("/api/pusher", require("./routes/pusher.routes"));
// ───────── RUTAS PRIVADAS ─────────
app.use("/api/accounts", require("./routes/account.routes.js"));
app.use("/api/users", require("./routes/user.routes.js"));
app.use("/api/admin", require("./routes/admin.routes.js"));

app.use("/api/chatbot-integration",require("./routes/chatbotIntegration.routes.js"));
app.use("/api/contacts", require("./routes/contact.routes"));
app.use("/api/analytics", require("./routes/analytics.routes.js"));

app.use("/api/chatbots", require("./routes/chatbots.routes.js"));
app.use("/api/flows", require("./routes/flows.routes.js"));
app.use("/api/node-types", require("./routes/nodeType.routes"));
app.use("/api/media", require("./routes/media.routes.js"));

app.use("/api/meta", require("./routes/meta.routes.js"));
app.use("/api/crm-fields", require("./routes/crmfields.routes"));
app.use("/api/validation-rule",require("./routes/validationRule.routes.js"))

// ───────── ERROR HANDLERS (AL FINAL SIEMPRE) ─────────
app.use(require("./middlewares/multerError.middleware.js"));

app.use((err, req, res, next) => {
  console.error("GLOBAL ERROR:", err);
  res.status(err.status || 400).json({
    message: err.message || "Error del servidor"
  });
});

module.exports = app;
