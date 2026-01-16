const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());


// test route
app.use("/test", require("./test/test.routes"));
app.use("/test-users", require("./test/test.user.routes"));

module.exports = app;