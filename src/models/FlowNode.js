const { Schema, model } = require("mongoose");

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

  options: [{
    label: String,
    next_node_id: {
      type: Schema.Types.ObjectId,
      ref: "FlowNode",
      default: null // 👈 CLAVE
    }
  }],

  next_node_id: {
    type: Schema.Types.ObjectId,
    ref: "FlowNode",
    default: null 
  },

  is_draft: {
    type: Boolean,
    default: true 
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
