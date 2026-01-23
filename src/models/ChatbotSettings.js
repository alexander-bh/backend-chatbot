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
        default: process.env.DEFAULT_CHATBOT_AVATAR
    },

    uploaded_avatars: [
        {
            url: String,
            public_id: String,
            created_at: { type: Date, default: Date.now }
        }
    ],
    
    primary_color: {
        type: String,
        default: "#2563eb"
    },

    secondary_color: {
        type: String,
        default: "#111827"
    },

    launcher_text: {
        type: String,
        default: "¿Te ayudo?"
    },

    bubble_style: {
        type: String,
        enum: ["rounded", "square"],
        default: "rounded"
    },

    font: {
        type: String,
        default: "inter"
    },

    is_enabled: {
        type: Boolean,
        default: true
    },

    position: {
        type: {
            type: String,
            enum: [
                "bottom-right",
                "bottom-left",
                "middle-right",
                "middle-left",
                "top-right",
                "top-left"
            ],
            default: "bottom-right"
        },
        offset_x: { type: Number, default: 24 },
        offset_y: { type: Number, default: 24 }
    },
    welcome_message: {
        type: String,
        default: "¡Hola! ¿Cómo puedo ayudarte?"
    },

    welcome_delay: {
        type: Number,
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
