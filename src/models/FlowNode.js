const { Schema, model } = require("mongoose");

const FlowNodeSchema = new Schema(
  {
    flow_id: {
      type: Schema.Types.ObjectId,
      ref: "Flow",
      required: true
    },

    parent_node_id: {
      type: Schema.Types.ObjectId,
      ref: "FlowNode",
      default: null
    },

    order: {
      type: Number,
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
        "jump",
        "link"
      ],
      required: true
    },

    content: String,

    variable_key: String,

    options: [
      {
        label: String,
        next_node_id: {
          type: Schema.Types.ObjectId,
          ref: "FlowNode"
        }
      }
    ],

    next_node_id: {
      type: Schema.Types.ObjectId,
      ref: "FlowNode"
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
      default: 2
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
  },
  { timestamps: true }
);

FlowNodeSchema.index({ flow_id: 1 });

module.exports = model("FlowNode", FlowNodeSchema);
