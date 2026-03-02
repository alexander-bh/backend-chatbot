const mongoose = require("mongoose");

const AvatarSchema = new mongoose.Schema({
  label: {
    type: String,
    required: true,
    trim: true
  },
  url: {
    type: String,
    required: true
  },
  public_id: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ["SYSTEM", "CUSTOM"],
    default: "CUSTOM"
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  created_at: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Avatar", AvatarSchema);