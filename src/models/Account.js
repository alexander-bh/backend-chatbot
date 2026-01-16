const { Schema, model } = require("mongoose");

const AccountSchema = new Schema({
  name: { type: String, required: true },
  plan: { type: String, default: "free" },
  status: { type: String, default: "active" },
  created_at: { type: Date, default: Date.now }
});

module.exports = model("Account", AccountSchema);