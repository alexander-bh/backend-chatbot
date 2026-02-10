const { Schema, model } = require("mongoose");

const PolicySchema = new Schema(
  {
    required: { type: Boolean, default: true },
    accept_label: { type: String, default: "Aceptar" },
    reject_label: { type: String, default: "Rechazar" }
  },
  { _id: false }
);

const LinkActionSchema = new Schema(
  {
    type: { type: String, enum: ["url", "email", "phone", "whatsapp"] },
    title: String,
    value: String
  },
  { _id: false }
);

const OptionSchema = new Schema(
  {
    label: String,
    value: String,
    order: { type: Number, default: 0 },
    next_node_id: { type: Schema.Types.ObjectId, ref: "FlowNode" }
  },
  { _id: false }
);

const ValidationSchema = new Schema(
  {
    enabled: { type: Boolean, default: false },
    rules: [
      {
        type: {
          type: String,
          enum: ["required", "min_max", "email", "phone", "integer", "decimal"],
          required: true
        },
        min: Number,
        max: Number,
        message: { type: String, required: true }
      }
    ]
  },
  { _id: false }
);

const MetaSchema = new Schema(
  {
    notify: {
      enabled: { type: Boolean, default: false },
      type: String,
      subject: String,
      template: String,
      send_once: { type: Boolean, default: true },
      recipients: { type: [String], default: [] }
    }
  },
  { _id: false, strict: false }
);

const FlowNodeSchema = new Schema(
  {
    account_id: { type: Schema.Types.ObjectId, ref: "Account", required: true },

    flow_id: {
      type: Schema.Types.ObjectId,
      ref: "Flow",
      required: true,
      index: true
    },

    order: { type: Number, default: 0 },

    node_type: {
      type: String,
      enum: [
        "text",
        "question",
        "email",
        "phone",
        "number",
        "text_input",
        "options",
        "jump",
        "link",
        "data_policy"
      ],
      required: true
    },

    content: String,
    variable_key: String,

    options: {
      type: [OptionSchema],
      default: []
    },

    next_node_id: {
      type: Schema.Types.ObjectId,
      ref: "FlowNode",
      default: null
    },

    link_action: {
      type: LinkActionSchema,
      default: undefined
    },

    policy: {
      type: PolicySchema,
      default: undefined
    },

    typing_time: {
      type: Number,
      default: 2,
      min: 0,
      max: 10
    },

    validation: {
      type: ValidationSchema,
      default: undefined
    },

    crm_field_key: { type: String, default: null },

    is_draft: { type: Boolean, default: true },

    meta: {
      type: MetaSchema,
      default: {}
    },

    end_conversation: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

FlowNodeSchema.index({ flow_id: 1, account_id: 1 });

// traversal rápido del flow
FlowNodeSchema.index({ flow_id: 1 });

// conexiones directas
FlowNodeSchema.index({ flow_id: 1, next_node_id: 1 });

// opciones con branching
FlowNodeSchema.index({ "options.next_node_id": 1 });

// runtime lookup
FlowNodeSchema.index({ flow_id: 1, order: 1 });

// notificaciones
FlowNodeSchema.index({ "meta.notify.enabled": 1 });


module.exports = model("FlowNode", FlowNodeSchema);
