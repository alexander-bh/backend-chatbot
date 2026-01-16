const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/test", require("./test/test.routes"));

module.exports = app;
