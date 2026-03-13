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
      required: true
    },

    current_node_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FlowNode",
      required: true
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
          type: mongoose.Schema.Types.ObjectId,
          ref: "FlowNode"
        },

        question: String,   // mensaje del bot
        answer: String,     // respuesta del usuario
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
      index: true
    },

    last_activity_at: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

ConversationSessionSchema.index({ status: 1 });
ConversationSessionSchema.index({ last_activity_at: 1 });
ConversationSessionSchema.index({ flow_id: 1, account_id: 1, mode: 1 });
ConversationSessionSchema.index({ "history.node_id": 1 });
ConversationSessionSchema.index({
  is_abandoned: 1,
  abandoned_at: 1
});
ConversationSessionSchema.index({
  visitor_id: 1,
  chatbot_id: 1,
  is_completed: 1
});


module.exports = mongoose.model(
  "ConversationSession",
  ConversationSessionSchema
);
