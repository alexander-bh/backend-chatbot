const { Schema, model } = require("mongoose");
const { USO_HERRAMIENTA, OBJETIVO } = require("../shared/enum/onboarding.enums");

const OnboardingSchema = new Schema(
  {
    empresa: String,
    tiene_sitio_web: { type: String, enum: ["SI", "NO"] },
    telefono: String,
    uso_herramienta: {
      type: String,
      enum: Object.values(USO_HERRAMIENTA)
    },
    objetivo: {
      type: String,
      enum: Object.values(OBJETIVO)
    },
    situacion_diaria: String
  },
  { _id: false }
);

const UserSchema = new Schema({
  account_id: {
    type: Schema.Types.ObjectId,
    ref: "Account",
    required: true
  },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ["ADMIN", "CLIENT"], required: true },
  onboarding: OnboardingSchema,
  created_at: { type: Date, default: Date.now }
});

UserSchema.index({ account_id: 1, email: 1 }, { unique: true });

module.exports = model("User", UserSchema);
