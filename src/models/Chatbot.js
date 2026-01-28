const { Schema, model, models } = require("mongoose");

const ChatbotSchema = new Schema({
  account_id: {
    type: Schema.Types.ObjectId,
    ref: "Account",
    required: true
  },

  public_id: { type: String, unique: true },

  name: { type: String, required: true },

  status: {
    type: String,
    default: "active"
  },

  welcome_message: {
    type: String,
    default: "¡Hola! ¿Cómo puedo ayudarte?"
  },

  /* ───────── SETTINGS EMBEBIDOS ───────── */
  avatar: {
    type: String,
    default: process.env.DEFAULT_CHATBOT_AVATAR
  },

  uploaded_avatars: [
    {
      url: String,
      public_id: String,
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

  is_enabled: {
    type: Boolean,
    default: true
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

  created_at: {
    type: Date,
    default: Date.now
  }
});

ChatbotSchema.index({ account_id: 1, created_at: -1 });

module.exports = models.Chatbot || model("Chatbot", ChatbotSchema);