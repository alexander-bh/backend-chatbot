const { Schema, model } = require("mongoose");

/* ================= SUBSCHEMAS ================= */

const ValidationRuleSchema = new Schema(
  {
    type: {
      type: String,
      enum: [
        "required",
        "MinMax",
        "email",
        "phone",
        "integer",
        "decimal",
        "phone_mx",
        "phone_country"
      ],
      required: true
    },
    min: Number,
    max: Number,
    message: { type: String, required: true }
  },
  { _id: false }
);

const ValidationSchema = new Schema(
  {
    enabled: { type: Boolean, default: false },
    rules: { type: [ValidationRuleSchema], default: [] }
  },
  { _id: false }
);

/* ================= NODE TYPE ================= */

const NodeTypeSchema = new Schema(
  {
    // multi-tenant opcional (si quieres por cuenta)
    account_id: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      default: null,
      index: true
    },

    // clave interna (ej: question, text, options)
    key: {
      type: String,
      required: true,
      trim: true
    },

    // nombre visible
    label: {
      type: String,
      required: true
    },

    mode: {
      type: String,
      enum: ["basic", "advanced"],
      default: "basic",
      index: true
    },

    // si el usuario responde
    answerUser: {
      type: Boolean,
      default: false
    },

    // qué secciones se activan
    accordions: {
      type: [String],
      enum: [
        "content",
        "typingTime",
        "validation",
        "saveField",
        "options",
        "policyOptions",
        "contactOptions"
      ],
      default: []
    },

    // valores por defecto cuando se crea un FlowNode
    defaults: {
      content: { type: String, default: "" },
      typing_time: { type: Number, default: 2 },
      validation: { type: ValidationSchema, default: undefined },
      options: { type: Array, default: [] },
      link_actions: { type: Array, default: [] }
    },

    // control de sistema
    is_system: {
      type: Boolean,
      default: false
    },

    is_active: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

/* ================= INDEXES ================= */

// evitar duplicados por cuenta
NodeTypeSchema.index({ key: 1, account_id: 1 }, { unique: true });

module.exports = model("NodeType", NodeTypeSchema);