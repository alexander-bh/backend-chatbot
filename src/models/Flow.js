const { Schema, model } = require("mongoose");

const FlowSchema = new Schema({
  chatbot_id: {
    type: Schema.Types.ObjectId,
    ref: "Chatbot",
    required: true
  },

  name: String,

  is_active: {
    type: Boolean,
    default: false 
  },

  is_draft: {
    type: Boolean,
    default: true 
  },

  created_at: {
    type: Date,
    default: Date.now
  }
});

module.exports = model("Flow", FlowSchema);
