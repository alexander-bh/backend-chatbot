const { Schema, model } = require("mongoose");

const FlowNodeSchema = new Schema(
  {
    account_id: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },

    flow_id: {
      type: Schema.Types.ObjectId,
      ref: "Flow",
      required: true,
      index: true
    },

    parent_node_id: {
      type: Schema.Types.ObjectId,
      ref: "FlowNode",
      default: null
    },

    order: {
      type: Number,
      default: 0
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
        "jump",
        "link"
      ],
      required: true
    },

    content: String,

    variable_key: String,

    options: {
      type: [
        {
          label: String,
          next_node_id: {
            type: Schema.Types.ObjectId,
            ref: "FlowNode",
            default: null
          }
        }
      ],
      default: null
    },

    next_node_id: {
      type: Schema.Types.ObjectId,
      ref: "FlowNode",
      default: null
    },

    link_action: {
      type: {
        type: String,
        enum: ["url", "email", "phone", "whatsapp"]
      },
      title: String,
      value: String
    },

    typing_time: {
      type: Number,
      default: 2,
      min: 0,
      max: 10
    },

    validation: {
      enabled: {
        type: Boolean,
        default: false
      },
      rules: [
        {
          type: {
            type: String,
            enum: [
              "min_max",
              "email",
              "phone",
              "integer",
              "decimal"
            ],
            required: true
          },
          min: Number,
          max: Number,
          message: {
            type: String,
            required: true
          }
        }
      ]
    },

    crm_field_key: {
      type: String,
      default: null
    },

    is_draft: {
      type: Boolean,
      default: true
    },
    
    position: {
      x: { type: Number, default: 0 },
      y: { type: Number, default: 0 }
    }
  },
  { timestamps: true }
);

FlowNodeSchema.index({ flow_id: 1, parent_node_id: 1, order: 1 });
FlowNodeSchema.index({ flow_id: 1, next_node_id: 1 });

module.exports = model("FlowNode", FlowNodeSchema);
