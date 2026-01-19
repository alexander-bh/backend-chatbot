const { Schema, model } = require("mongoose");

const FlowNodeSchema = new Schema(
  {
    flow_id: {
      type: Schema.Types.ObjectId,
      ref: "Flow",
      required: true
    },

    node_type: {
      type: String,
      enum: [
        "text",
        "question",
        "email",
        "phone",
        "number",
        "options",
        "jump"
      ],
      required: true
    },

    content: String,

    variable_key: {
      type: String
    },

    options: [
      {
        label: String,
        next_node_id: {
          type: Schema.Types.ObjectId,
          ref: "FlowNode",
          default: null
        }
      }
    ],

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
    }
  },
  { timestamps: true }
);

module.exports = model("FlowNode", FlowNodeSchema);
