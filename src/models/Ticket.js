const mongoose = require("mongoose");

const ticketSchema = new mongoose.Schema(
  {
    ticket_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    subject: {
      type: String,
      required: true,
      maxlength: 200,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      enum: ["bug", "duda", "mejora", "acceso", "otro"],
    },
    priority: {
      type: String,
      required: true,
      enum: ["baja", "media", "alta"],
      default: "media",
    },
    description: {
      type: String,
      required: true,
      maxlength: 1000,
    },
    channel: {
      type: String,
      enum: ["whatsapp", "email"],
      required: true,
    },
    status: {
      type: String,
      enum: ["abierto", "en revisión", "resuelto"],
      default: "abierto",
    },
    screenshot_url: {
      type: String,
      default: null,
    },
    screenshot_public_id: {
      type: String,
      default: null,
    },
    // Referencia al usuario que creó el ticket
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    account_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    // Notas internas del admin
    admin_notes: {
      type: String,
      default: "",
    },
    resolved_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

// Índices útiles para filtrado en admin
ticketSchema.index({ status: 1 });
ticketSchema.index({ user_id: 1 });
ticketSchema.index({ account_id: 1 });
ticketSchema.index({ created_at: -1 });

module.exports = mongoose.model("Ticket", ticketSchema);