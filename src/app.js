// normales
app.use(cors());
app.use(express.json());

// health
app.get("/ping", (req, res) => {
  res.json({ ok: true });
});

// mongo (normal middleware)
app.use(require("./middlewares/mongo.middleware.js"));

/* ───────── RUTAS ───────── */

app.use("/api/auth", require("./routes/auth.routes.js"));
app.use("/api/public-chatbot", require("./routes/public-chatbot.routes.js"));

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

/* ───────── ERROR HANDLERS (SIEMPRE AL FINAL) ───────── */

// ⛔ ESTE VA AL FINAL DE TODO
app.use(require("./middlewares/multerError.middleware.js"));

module.exports = app;
