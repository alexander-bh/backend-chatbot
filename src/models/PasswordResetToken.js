const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: "User"
  },
  token: {
    type: String,
    required: true
  },
  expires_at: {
    type: Date,
    required: true,
    index: { expires: 0 }
  },
  attempts: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

module.exports = mongoose.model("PasswordResetToken", schema);
