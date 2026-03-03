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
    required: function () {
      return !this.is_template;
    },
    index: true
  },

  chatbot_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Chatbot",
    required: false,   // 🔹 ya no obligatorio
    index: true
  },

  session_id: {
    type: mongoose.Schema.Types.ObjectId,
    sparse: true
  },
  
  source: {
    type: String,
    enum: ["chatbot", "manual", "system"],
    default: "chatbot",
    index: true
  },

  name: String,
  last_name: String,
  email: String,
  phone: String,

  company: String,
  website: String,
  company_phone: String,
  company_extension: String,

  city: String,
  country: String,
  address: String,

  position: String,
  birth_date: Date,

  linkedin: String,
  skype: String,

  observations: String,

  data_processing_consent: {
    type: String,
    enum: ["accepted", "rejected", "pending"],
    default: "pending"
  },

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
  }

}, { timestamps: true });

/* =========================
   INDEXES EXTRA
========================= */
ContactSchema.index({ account_id: 1, chatbot_id: 1, createdAt: -1 });
ContactSchema.index(
  { account_id: 1, chatbot_id: 1, session_id: 1 },
  { unique: true, sparse: true }
);

module.exports = mongoose.model("Contact", ContactSchema);