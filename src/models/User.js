const { Schema, model } = require("mongoose");

const UserSchema = new Schema({
  account_id: {
    type: Schema.Types.ObjectId,
    ref: "Account"
  },
  name: String,
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["ADMIN", "CLIENT"], required: true },
  created_at: { type: Date, default: Date.now }
});




module.exports = model("User", UserSchema);