const { Schema, model } = require("mongoose");

const FlowSchema = new Schema(
  {
    account_id: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true
    },

    chatbot_id: {
      type: Schema.Types.ObjectId,
      ref: "Chatbot",
      required: true
    },

    name: {
      type: String,
      required: true
    },

    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft"
    },

    start_node_id: {
      type: Schema.Types.ObjectId,
      ref: "FlowNode",
      default: null
    },

    lock: {
      locked_by: {
        type: Schema.Types.ObjectId, 
        ref: "User",
        default: null
      },
      locked_at: Date,
      lock_expires_at: Date
    },

    version: {
      type: Number,
      default: 1
    },

    base_flow_id: {
      type: Schema.Types.ObjectId,
      ref: "Flow",
      default: null
    },

    published_at: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

// Índices
FlowSchema.index({ account_id: 1 });
FlowSchema.index({ chatbot_id: 1, status: 1 });

module.exports = model("Flow", FlowSchema);
