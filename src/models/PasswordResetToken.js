const mongoose = require("mongoose");

const PasswordResetTokenSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    token: {
        type: String,
        required: true
    },
    expires_at: {
        type: Date,
        required: true,
        index: { expires: "30m" }
    }
}, { timestamps: true });

module.exports = mongoose.model("PasswordResetToken", PasswordResetTokenSchema);
