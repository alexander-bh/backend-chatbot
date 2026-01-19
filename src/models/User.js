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
    type: mongoose.Schema.Types.ObjectId,
    ref: "Account",
    required: true
  },
  name: String,
  email: String,
  password: String,
  role: String,

  onboarding: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  created_at: { type: Date, default: Date.now }
});

// email único por cuenta
UserSchema.index({ account_id: 1, email: 1 }, { unique: true });

module.exports = model("User", UserSchema);
