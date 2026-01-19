// models/Contact.js
const mongoose = require("mongoose");

const ContactSchema = new mongoose.Schema({
  account_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  chatbot_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  name: String,
  email: String,
  phone: String
}, { timestamps: { createdAt: "created_at" } });

module.exports = mongoose.model("Contact", ContactSchema);
