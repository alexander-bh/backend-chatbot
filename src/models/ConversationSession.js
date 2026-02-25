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

    variables: {
      type: Object,
      default: {}
    },

    // 🔥 NUEVO → historial completo
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

    mode: {
      type: String,
      enum: ["preview", "production"],
      default: "production"
    },

    is_completed: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

ConversationSessionSchema.index({ flow_id: 1, account_id: 1, mode: 1 });
ConversationSessionSchema.index({ "history.node_id": 1 });
ConversationSessionSchema.index({ is_completed: 1 });

module.exports = mongoose.model(
  "ConversationSession",
  ConversationSessionSchema
);
