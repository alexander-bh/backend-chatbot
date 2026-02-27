const { Schema, model } = require("mongoose");

const FlowSchema = new Schema(
  {
    // 🔹 SOLO null cuando es template
    account_id: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      default: null,
      index: true
    },

    // 🔹 SOLO null cuando es template
    chatbot_id: {
      type: Schema.Types.ObjectId,
      ref: "Chatbot",
      default: null,
      index: true
    },

    // 🔥 CLAVE
    is_template: {
      type: Boolean,
      default: false,
      index: true
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

    // 🔗 referencia al template original
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
FlowSchema.index({ is_template: 1 });

// Flows por chatbot
FlowSchema.index({ chatbot_id: 1, status: 1 });

// Flows por cuenta
FlowSchema.index({ account_id: 1 });

// Versionado
FlowSchema.index({ base_flow_id: 1 });

module.exports = model("Flow", FlowSchema);
