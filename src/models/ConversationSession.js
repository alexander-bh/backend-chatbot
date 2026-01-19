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

    variables: {
      type: Object,
      default: {}
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
