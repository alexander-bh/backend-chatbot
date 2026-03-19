const { Schema, model } = require("mongoose");

const AccountSchema = new Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  plan: { type: String, enum: ["free", "pro", "enterprise"], default: "free" },
  status: { type: String, enum: ["active", "suspended"], default: "active" },


  notification_emails_enabled: {  // ← nuevo campo booleano
    type: Boolean,
    default: false
  },

  notification_emails: {   // ← cambiado a array
    type: [String],
    default: []
  },

  created_at: { type: Date, default: Date.now }
});

module.exports = model("Account", AccountSchema);