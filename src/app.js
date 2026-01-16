const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", require("./routes/auth.routes"));
//app.use("/api/chatbots", require("./routes/chatbots.routes"));
//app.use("/api/flows", require("./routes/flows.routes"));
//app.use("/api/flow-nodes", require("./routes/flow-nodes.routes"));


// Test routes
app.use("/api/test", require("./test/test.routes"));

module.exports = app;

