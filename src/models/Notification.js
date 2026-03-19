// models/Notification.js
const { Schema, model } = require("mongoose");

const NotificationSchema = new Schema(
  {
    account_id: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true
    },

    type: {
      type: String,
      enum: ["contacts_deleted"],
      required: true
    },

    title: {
      type: String,
      required: true
    },

    message: {
      type: String,
      required: true
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