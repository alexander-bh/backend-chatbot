const { Schema, model } = require("mongoose");

const OptionSchema = new Schema({
  label: String,
  next_node_id: { type: Schema.Types.ObjectId, ref: "FlowNode" }
}, { _id: false });

const FlowNodeSchema = new Schema({
  flow_id: {
    type: Schema.Types.ObjectId,
    ref: "Flow",
    required: true
  },

  node_type: {
    type: String,
    enum: ["text", "options", "input_email", "input_phone", "jump"],
    required: true
  },

  content: String,

  options: [OptionSchema], // solo para "options"

  metadata: {
    type: Object,
    default: {}
  },

  next_node_id: {
    type: Schema.Types.ObjectId,
    ref: "FlowNode",
    default: null
  },

  position: {
    x: Number,
    y: Number
  },

  created_at: {
    type: Date,
    default: Date.now
  }
});

module.exports = model("FlowNode", FlowNodeSchema);
