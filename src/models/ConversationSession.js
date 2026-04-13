const mongoose = require("mongoose");

const ConversationSessionSchema = new mongoose.Schema(
  {
    account_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true
    },

    chatbot_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chatbot",
      required: true
    },

    flow_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Flow",
    },

    current_node_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FlowNode",
    },

    current_branch_id: {
      type: String,
      default: null
    },

    contact_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contact",
      default: null
    },

    variables: {
      type: Object,
      default: {}
    },

    origin_url: {
      type: String,
      default: null,
    },

    history: [
      {
        node_id: {
          type: String,
          default: null
        },

        question: String,
        answer: String,
        node_type: String,
        variable_key: String,

        timestamp: {
          type: Date,
          default: Date.now
        }
      }
    ],

    status: {
      type: String,
      enum: ["active", "completed", "abandoned", "closed"],
      default: "active",
    },

    mode: {
      type: String,
      enum: ["preview", "production"],
      default: "production"
    },

    is_completed: {
      type: Boolean,
      default: false
    },
    is_abandoned: {
      type: Boolean,
      default: false
    },

    abandoned_at: {
      type: Date,
      default: null
    },

    visitor_id: {
      type: String,
      default: null,
    },

    last_activity_at: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

// ── Índices generales ─────────────────────────────────────────────────────────
ConversationSessionSchema.index({ status: 1 });
ConversationSessionSchema.index({ last_activity_at: 1 });
ConversationSessionSchema.index({ flow_id: 1, account_id: 1, mode: 1 });
ConversationSessionSchema.index({ "history.node_id": 1 });
ConversationSessionSchema.index({ visitor_id: 1, chatbot_id: 1, is_completed: 1 });

// ── Índices para el trigger ───────────────────────────────────────────────────
ConversationSessionSchema.index({ is_completed: 1, is_abandoned: 1, status: 1, last_activity_at: 1 });
ConversationSessionSchema.index({ "variables.data_processing_consent": 1 });
ConversationSessionSchema.index({ is_abandoned: 1, abandoned_at: 1, contact_id: 1 });

module.exports = mongoose.model(
  "ConversationSession",
  ConversationSessionSchema
);
