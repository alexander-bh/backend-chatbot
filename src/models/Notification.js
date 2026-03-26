const { Schema, model } = require("mongoose");

const NotificationSchema = new Schema(
    {
        account_id: {
            type: String,          // ← String en lugar de ObjectId
            ref: "Account",
            required: true,
            index: true
        },

        type: {
            type: String,
            enum: [
                "contacts_deleted",
                "new_contact",
                "new-ticket",       // ← agregar el tipo que usa ticket.controller
            ],
            required: true
        },
        title: {
            type: String,
            required: true
        },

        message: {
            type: String,
            required: false        // ← ticket.controller usa "body" no "message"
        },

        body: {
            type: String,
            required: false        // ← campo que usa ticket.controller
        },

        metadata: {
            type: Object,
            default: {}
        },

        data: {
            type: Object,
            default: {}
        },

        is_read: {
            type: Boolean,
            default: false,
            index: true
        }
    },
    { timestamps: true }
);

NotificationSchema.index({ account_id: 1, is_read: 1, createdAt: -1 });

module.exports = model("Notification", NotificationSchema);