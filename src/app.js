const express = require("express");
const cors = require("cors");
const connectDB = require("./config/database");

const app = express();

connectDB(); 

app.use(cors());
app.use(express.json());

app.use("/test", require("./test/test-db.js"));
app.use("/test-users", require("./test/test.user.routes.js"));
app.use("/test-chatbots", require("./test/test.chatbot.routes.js"));

module.exports = app;