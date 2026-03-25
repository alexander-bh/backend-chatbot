const mongoose = require("mongoose");

const supportConfigSchema = new mongoose.Schema(
  {
    support_email: {
      type: String,
      default: null,
      trim: true,
    },
    support_whatsapp: {
      type: String,
      default: null,
      trim: true,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

module.exports = mongoose.model("SupportConfig", supportConfigSchema);