const { Schema, model, models } = require("mongoose");
const crypto = require("crypto");

const EmailSettingsSchema = new Schema({
  enabled: {
    type: Boolean,
    default: false
  },
  from_name: {
    type: String,
    default: "Chatbot"
  },
  from_email: {
    type: String,
    default: ""
  },
  to_email: {
    type: String,
    default: ""
  }
}, { _id: false });

const ChatbotSchema = new Schema({
  account_id: {
    type: Schema.Types.ObjectId,
    ref: "Account",
    required: true
  },

  public_id: { type: String, unique: true, required: true },

  name: { type: String, required: true },

  email_settings: {
    type: EmailSettingsSchema,
    default: () => ({})
  },

  status: {
    type: String,
    enum: ["active", "inactive"],
    default: "active"
  },

  is_enabled: {
    type: Boolean,
    default: true
  },

  /* ───────── INSTALLATION & SECURITY ───────── */

  allowed_domains: {
    type: [String],
    default: []
  },

  installation_status: {
    type: String,
    enum: ["pending", "verified"],
    default: "pending"
  },

  last_verified_at: {
    type: Date
  },

  install_token: {
    type: String,
    unique: true
  },

  /* ───────── SETTINGS EMBEBIDOS ───────── */

  welcome_message: {
    type: String,
    default: "¡Hola! ¿Cómo puedo ayudarte?"
  },

  welcome_delay: {
    type: Number,
    default: 2,
    min: 0,
    max: 10
  },

  show_welcome_on_mobile: {
    type: Boolean,
    default: true
  },

  avatar: {
    type: String,
    default: process.env.DEFAULT_CHATBOT_AVATAR
  },

  uploaded_avatars: [
    {
      id: String,
      label: String,
      url: String,
      created_at: { type: Date, default: Date.now }
    }
  ],

  primary_color: {
    type: String,
    default: "#2563eb"
  },

  secondary_color: {
    type: String,
    default: "#111827"
  },

  launcher_text: {
    type: String,
    default: "¿Te ayudo?"
  },

  position: {
    type: String,
    enum: [
      "bottom-right",
      "bottom-left",
      "middle-right",
      "middle-left",
      "top-right",
      "top-left"
    ],
    default: "bottom-right"
  },

  input_placeholder: {
    type: String,
    default: "Escribe tu mensaje..."
  },

  show_branding: {
    type: Boolean,
    default: true
  },
}, { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } });

/* ───────── NORMALIZADOR DE DOMINIOS ───────── */
ChatbotSchema.pre("save", function () {
  // Normaliza los dominios permitidos
  if (Array.isArray(this.allowed_domains)) {
    this.allowed_domains = this.allowed_domains
      .filter(Boolean)
      .map(domain =>
        domain
          .replace(/^https?:\/\//, "")
          .replace(/\/$/, "")
          .toLowerCase()
      );
  }
  if (!this.install_token) {
    this.install_token = crypto.randomBytes(24).toString("hex");
  }
});

ChatbotSchema.index({ account_id: 1, created_at: -1 });

module.exports = models.Chatbot || model("Chatbot", ChatbotSchema);