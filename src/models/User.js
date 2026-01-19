const { Schema, model } = require("mongoose");

const OnboardingSchema = new Schema(
  {
    empresa: { type: String, trim: true },

    tiene_sitio_web: {
      type: String,
      enum: ["SI", "NO"]
    },

    telefono: String,

    uso_herramienta: {
      type: String,
      enum: [
        "NEGOCIO",
        "EQUIPO_COMERCIAL",
        "APRENDER",
        "PROYECTO_PERSONAL"
      ]
    },

    objetivo: {
      type: String,
      enum: [
        "AUMENTAR_VENTAS",
        "AUTOMATIZAR_RESPUESTAS",
        "ORGANIZAR_CONTACTOS"
      ]
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

  name: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  password: { type: String },
  role: { type: String },

  onboarding: {
    type: Schema.Types.Mixed, // ✅ NO mongoose
    default: {}
  },

  created_at: {
    type: Date,
    default: Date.now
  }
});

// email único por cuenta
UserSchema.index({ account_id: 1, email: 1 }, { unique: true });

module.exports = model("User", UserSchema);
