const { Schema, model } = require("mongoose");

const CRMFieldSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    label: {
      type: String,
      required: true,
      trim: true
    },
    is_active: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

CRMFieldSchema.index({ key: 1 }, { unique: true });

module.exports = model("CRMField", CRMFieldSchema);
