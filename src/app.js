const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());


//ruta de prueba
app.get("/ping", (req, res) => {
  res.json({ ok: true });
});

//middleware para conectar a mongoDB
//middleware para manejar errores de multer
app.use(require("./middlewares/multerError.middleware"));
app.use(require("./middlewares/mongo.middleware.js"));

//rutas principales
app.use("/api/chatbots", require("./routes/chatbots.routes.js"));

app.use("/api/accounts", require("./routes/account.routes.js"));
app.use("/api/users", require("./routes/user.routes.js"));
app.use("/api/auth", require("./routes/auth.routes.js"));
app.use("/api/admin", require("./routes/admin.routes.js"));

//rutas de configuracion de chatbots
app.use("/api/chatbots", require("./routes/chatbots.routes.js"));
app.use("/api/chatbot-settings", require("./routes/chatbotSettings.routes.js"));
app.use("/api/flows", require("./routes/flows.routes.js"));
app.use("/api/flownodes", require("./routes/flow.nodes.routes.js"));  

// Nueva ruta para CRM Fields
app.use("/api/crm-fields", require("./routes/crmfields.routes"));
app.use("/api/meta", require("./routes/meta.routes.js"));

// Rutas de conversación
app.use("/api/conversations",require("./routes/conversationSession.routes.js"));



module.exports = app;