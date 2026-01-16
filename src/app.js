const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

//routes
app.use("/auth", require("./routes/auth.routes"));
app.use("/chatbots", require("./routes/chatbots.routes"));
app.use("/users", require("./routes/users.routes"));
app.use("/flows", require("./routes/flows.routes"));
app.use("/flow-nodes", require("./routes/flow-nodes.routes"));

// test route
app.use("/test", require("./test/test.routes"));
app.use("/test-users", require("./test/test.user.routes"));

module.exports = app;