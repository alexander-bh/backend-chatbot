const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());


// test routes
app.use("/test", require("./test/test-db"));
app.use("/test-users", require("./test/test.user.routes"));
app.use("/test-chatbots", require("./test/test.chatbots.routes"));


module.exports = app;