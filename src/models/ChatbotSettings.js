const { Schema, model } = require("mongoose");

const ChatbotSettingsSchema = new Schema({
    chatbot_id: {
        type: Schema.Types.ObjectId,
        ref: "Chatbot",
        required: true,
        unique: true
    },

    avatar: {
        type: String,
        default:process.env.DEFAULT_CHATBOT_AVATAR
    },

    primary_color: {
        type: String,
        default: "#0083e2"
    },

    position: {
        type: {
            type: String,
            enum: ["bottom-right", "bottom-left", "top-right", "top-left"],
            default: "bottom-right"
        },
        offset_x: { type: Number, default: 20 },
        offset_y: { type: Number, default: 20 }
    },

    welcome_message: {
        type: String,
        default: "¡Hola! ¿Cómo puedo ayudarte?"
    },

    welcome_delay: {
        type: Number, // segundos
        default: 2
    },

    input_placeholder: {
        type: String,
        default: "Escribe tu mensaje..."
    },

    show_welcome_on_mobile: {
        type: Boolean,
        default: true
    },

    //  Marca
    show_branding: {
        type: Boolean,
        default: true
    },

    created_at: {
        type: Date,
        default: Date.now
    }
});

module.exports = model("ChatbotSettings", ChatbotSettingsSchema);
