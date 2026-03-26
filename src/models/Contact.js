// models/Contact.js
const mongoose = require("mongoose");


const ContactSchema = new mongoose.Schema({

  account_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Account",
    required: function () {
      return !this.is_template;
    },
  },

  chatbot_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Chatbot",
  },

  session_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ConversationSession",
    sparse: true,
  },

  source: {
    type: String,
    enum: ["chatbot", "manual", "system"],
    default: "chatbot",
  },

  origin_url: {
    type: String,
    default: null,
  },

  device: {
    type: String,
    enum: ["desktop", "mobile", "tablet", "unknown"],
    default: "unknown"
  },

  ip_address: {
    type: String,
  },

  name: {
    type: String,
    trim: true
  },
  last_name: {
    type: String,
    trim: true
  },
  email: {
    type: String,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },

  birth_date: Date,

  company: {
    type: String,
    trim: true
  },
  job_title: String,
  website: String,
  company_phone: String,
  phone_ext: String,
  position: String,
  city: String,
  country: String,
  state: String,
  postal_code: String,
  address: String,
  observations: String,
  privacy: String,
  notes: String,

  data_processing_consent: {
    type: String,
    enum: ["accepted", "rejected", "pending"],
    default: "pending"
  },

  visitor_id: {
    type: String,
  },

  variables: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  status: {
    type: String,
    enum: ["new", "contacted", "qualified", "lost", "discarded"],
    default: "new",
  },

  is_deleted: {
    type: Boolean,
    default: false,
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

  status_changed_at: {
    type: Date,
    default: null
  },

  // Límites en días configurables por cuenta/contacto
  lost_limit_at: {
    type: Date,
    default: null  // null = sin límite
  },

  discarded_limit_at: {
    type: Date,
    default: null  // null = sin límite
  },

  discarded_reason: {
    type: String,
    default: null
  },

  discarded_notes: {
    type: String,
    default: null
  },

  duration_seconds: Number

}, { timestamps: true });

ContactSchema.index({ account_id: 1, createdAt: -1 });
ContactSchema.index({ account_id: 1, lead_score: -1 });
ContactSchema.index({ account_id: 1, visitor_id: 1 });
ContactSchema.index(
  { account_id: 1, chatbot_id: 1, session_id: 1 },
  {
    unique: true,
    partialFilterExpression: {
      session_id: { $exists: true }
    }
  }
);
ContactSchema.index(
  { account_id: 1, email: 1 },
  {
    unique: true,
    partialFilterExpression: {
      email: { $exists: true },       
      is_template: { $eq: false }
    }
  }
);

ContactSchema.index(
  { account_id: 1, phone: 1 },
  {
    unique: true,
    partialFilterExpression: {
      phone: { $exists: true }, 
      is_template: { $eq: false }
    }
  }
);
module.exports = mongoose.model("Contact", ContactSchema);
