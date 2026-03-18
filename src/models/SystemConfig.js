const mongoose = require("mongoose");

const systemConfigSchema = new mongoose.Schema({
  key:   { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed, default: null }
}, { timestamps: true });

module.exports = mongoose.model("SystemConfig", systemConfigSchema);