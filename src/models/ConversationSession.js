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

module.exports = mongoose.model(
  "ConversationSession",
  ConversationSessionSchema
);
