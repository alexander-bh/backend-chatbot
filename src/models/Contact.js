// models/Contact.js
const mongoose = require("mongoose");

/* =========================
   CONTACT SCHEMA
========================= */

const ContactSchema = new mongoose.Schema({

  account_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Account",
    required: function () {
      return !this.is_template;
    },
    index: true
  },

  chatbot_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Chatbot",
    index: true
  },

  session_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ConversationSession",
    sparse: true,
    index: true
  },

  source: {
    type: String,
    enum: ["chatbot", "manual", "system"],
    default: "chatbot",
    index: true
  },

  origin_url: {
    type: String,
    default: null,
    index: true
  },

  device: {
    type: String,
    enum: ["desktop", "mobile", "tablet", "unknown"],
    default: "unknown"
  },

  ip_address: {
    type: String,
    index: true
  },

  // 👤 Datos personales
  name: String,
  last_name: String,
  email: String,
  phone: String,

  birth_date: Date,

  // 🏢 Datos empresa
  company: String,
  website: String,
  company_phone: String,
  position: String,
  city: String,
  country: String,
  state: String,
  postal_code: String,
  address: String,
  observations: String,

  data_processing_consent: {
    type: String,
    enum: ["accepted", "rejected", "pending"],
    default: "pending"
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

  is_deleted: {
    type: Boolean,
    default: false,
    index: true
  },

  is_template: {
    type: Boolean,
    default: false
  },

  completed: {
    type: Boolean,
    default: false
  },

  completed_goal: {
    type: Boolean,
    default: false
  },

  lead_score: {
    type: Number,
    default: 0
  },

  duration_seconds: Number

}, { timestamps: true });

ContactSchema.index({ account_id: 1, chatbot_id: 1, createdAt: -1 });
ContactSchema.index(
  { account_id: 1, chatbot_id: 1, session_id: 1 },
  { unique: true, sparse: true }
);

module.exports = mongoose.model("Contact", ContactSchema);
