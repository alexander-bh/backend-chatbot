// models/ValidationRule.js
const mongoose = require("mongoose");

const ValidationRuleSchema = new mongoose.Schema({
  key: { type: String, required: true },          // required, email_format...
  label: { type: String, required: true },        // Visible en UI
  category: { type: String, required: true },     // text, phone, number, email, link
  default_message: { type: String, required: true },
  has_params: { type: Boolean, default: false },
  is_active: { type: Boolean, default: true }
});

module.exports = mongoose.model("ValidationRule", ValidationRuleSchema);
