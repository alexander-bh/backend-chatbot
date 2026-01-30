const { Schema, model } = require("mongoose");

const FlowNodeSchema = new Schema(
  {
    account_id: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true
    },

    flow_id: {
      type: Schema.Types.ObjectId,
      ref: "Flow",
      required: true,
      index: true
    },

    // Solo metadata visual (no runtime)
    parent_node_id: {
      type: Schema.Types.ObjectId,
      ref: "FlowNode",
      default: null
    },

    // ORDER-FIRST ENGINE
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
        "text_input",
        "options",
        "jump",
        "link"
      ],
      required: true
    },

    content: String,

    variable_key: String,

    // OPTIONS BRANCHING
    options: {
      type: [
        new Schema(
          {
            label: String,

            value: {
              type: String,
              required: true
            },

            order: {
              type: Number,
              default: 0
            },

            next_node_id: {
              type: Schema.Types.ObjectId,
              ref: "FlowNode",
              default: null
            }
          },
          { _id: false }
        )
      ],
      default: []
    },

    // LINEAR FLOW
    next_node_id: {
      type: Schema.Types.ObjectId,
      ref: "FlowNode",
      default: null
    },

    // LINK ACTION
    link_action: {
      type: new Schema(
        {
          type: {
            type: String,
            enum: ["url", "email", "phone", "whatsapp"]
          },
          title: String,
          value: String
        },
        { _id: false }
      ),
      default: undefined
    },

    typing_time: {
      type: Number,
      default: 2,
      min: 0,
      max: 10
    },

    validation: {
      type: new Schema(
        {
          enabled: {
            type: Boolean,
            default: false
          },

          rules: [
            {
              type: {
                type: String,
                enum: [
                  "required",
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
        { _id: false }
      ),
      default: undefined
    },

    crm_field_key: {
      type: String,
      default: null
    },

    is_draft: {
      type: Boolean,
      default: true
    },

    meta: {
      type: Schema.Types.Mixed,
      default: {}
    },

    end_conversation: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

/* =====================================================
   INDEXES — PERFORMANCE + CONSISTENCY
===================================================== */

// ORDER-FIRST ENGINE (CRÍTICO)
FlowNodeSchema.index(
  { flow_id: 1, order: 1 },
  { unique: true }
);

// Para debugging / validaciones / graph tools
FlowNodeSchema.index({ flow_id: 1, next_node_id: 1 });

// Para detectar referencias desde options
FlowNodeSchema.index({
  flow_id: 1,
  "options.next_node_id": 1
});

/* =====================================================
   PRE VALIDATE — LOGIC VALIDATION
===================================================== */

FlowNodeSchema.pre("validate", function (next) {

  // OPTIONS nodes deben tener opciones
  if (this.node_type === "options") {
    if (!this.options || this.options.length === 0) {
      return next(
        new Error("Nodes tipo 'options' requieren al menos una opción")
      );
    }
  }

  // Nodos no options no deben tener options
  if (this.node_type !== "options") {
    if (this.options && this.options.length > 0) {
      return next(
        new Error("Solo nodos tipo 'options' pueden contener options")
      );
    }
  }

  next();
});

module.exports = model("FlowNode", FlowNodeSchema);
