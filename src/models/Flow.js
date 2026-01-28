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

    // Estado
    status: {
      type: String,
      enum: ["draft", "active", "archived"],
      default: "draft"
    },

    start_node_id: {
      type: Schema.Types.ObjectId,
      ref: "FlowNode",
      default: null
    },

    // Versionado
    version: {
      type: Number,
      required: true
    },

    base_flow_id: {
      type: Schema.Types.ObjectId,
      ref: "Flow",
      default: null
    },

    published_at: Date
  },
  { timestamps: true }
);

// Índices útiles
FlowSchema.index({ account_id: 1 });
FlowSchema.index({ chatbot_id: 1, is_active: 1 });

module.exports = model("Flow", FlowSchema);
