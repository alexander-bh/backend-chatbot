const { Schema, model } = require("mongoose");

const FlowSchema = new Schema(
  {
    account_id: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true
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

    is_active: {
      type: Boolean,
      default: false
    },

    is_draft: {
      type: Boolean,
      default: true
    },

    start_node_id: {
      type: Schema.Types.ObjectId,
      ref: "FlowNode",
      default: null
    },

    published_at: Date,

    version: {
      type: Number,
      default: 0
    }
  },
  { timestamps: true }
);

// Índices útiles
FlowSchema.index({ account_id: 1 });
FlowSchema.index({ chatbot_id: 1, is_active: 1 });

module.exports = model("Flow", FlowSchema);
