// models/Contact.js
const mongoose = require("mongoose");

/* =========================
   MESSAGE SCHEMA
========================= */
const MessageSchema = new mongoose.Schema({
  node_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "FlowNode",
    required: true
  },
  type: {
    type: String,
    required: true
  },
  question: String,
  answer: String,
  variable: String,
  is_bot: {
    type: Boolean,
    default: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

/* =========================
   CONTACT SCHEMA
========================= */
const ContactSchema = new mongoose.Schema({

  account_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Account",
    required: true,
    index: true
  },

  chatbot_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Chatbot",
    required: true,
    index: true
  },

  session_id: {
    type: mongoose.Schema.Types.ObjectId,
    unique: true,
    required: true
  },

  name: String,
  email: String,
  phone: String,

  conversation: {
    type: [MessageSchema],
    default: []
  },

  variables: {
    type: Object,
    default: {}
  },

  status: {
    type: String,
    enum: ["new", "contacted", "qualified", "lost"],
    default: "new",
    index: true
  },

  completed: {
    type: Boolean,
    default: false
  }

}, { timestamps: true });

/* =========================
   INDEXES EXTRA
========================= */
ContactSchema.index({ account_id: 1, chatbot_id: 1, created_at: -1 });

module.exports = mongoose.model("Contact", ContactSchema);