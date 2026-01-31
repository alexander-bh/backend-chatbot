const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema({
    actor_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    target_type: {
        type: String,
        required: true,
        enum: ["USER", "CHATBOT", "FLOW"]
    },

    target_id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },

    action: {
        type: String,
        required: true,
        enum: ["CREATE", "UPDATE", "DELETE", "ROLE_CHANGE","IMPERSONATE"]
    },

    before: {
        type: Object,
        default: null
    },

    after: {
        type: Object,
        default: null
    },

    ip: String,
    user_agent: String,

    created_at: {
        type: Date,
        default: Date.now
    }
});

auditLogSchema.index({ actor_id: 1 });
auditLogSchema.index({ target_id: 1 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ created_at: -1 });
auditLogSchema.index({ target_type: 1, created_at: -1 });



module.exports = mongoose.model("AuditLog", auditLogSchema);
