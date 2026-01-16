const { Schema, model } = require("mongoose");

const ChatbotSchema = new Schema({
  account_id: {
    type: Schema.Types.ObjectId,
    ref: "Account",
    required: true
  },
  public_id: { type: String, unique: true },
  name: String,
  welcome_message: String,
  status: { type: String, default: "active" },
  created_at: { type: Date, default: Date.now }
});

module.exports = model("Chatbot", ChatbotSchema);