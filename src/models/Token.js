const { Schema, model } = require("mongoose");

const TokenSchema = new Schema({
  user_id: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  token: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  expires_at: {
    type: Date,
    required: true
  },
  created_at: {
    type: Date,
    default: Date.now
  }
});

module.exports = model("Token", TokenSchema);
