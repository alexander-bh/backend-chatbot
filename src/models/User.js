const { Schema, model } = require("mongoose");

const OnboardingSchema = new Schema(
  {
    empresa: String,
    tiene_sitio_web: { type: String, enum: ["SI", "NO"] },
    telefono: String,
    uso_herramienta: {
      type: String,
      enum: ["NEGOCIO", "EQUIPO_COMERCIAL", "APRENDER", "PROYECTO_PERSONAL"]
    },
    objetivo: {
      type: String,
      enum: ["AUMENTAR_VENTAS", "AUTOMATIZAR_RESPUESTAS", "ORGANIZAR_CONTACTOS","ORGANIZAR_CONTACTOS_O_IDEAS","AUTAMATIZAR_VENTAS"]
    },
    situacion_diaria: String
  },
  { _id: false }
);

const UserSchema = new Schema({
  account_id: {
    type: Schema.Types.ObjectId, // ✅ AQUÍ ESTÁ LA CLAVE
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
