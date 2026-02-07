/* ===============================
   VALIDACIÓN GLOBAL
================================ */
if (!window.__CHATBOT_CONFIG__) {
    console.error("Chatbot config no encontrada");
    return;
}

const {
    apiBase,
    publicId,
    name,
    avatar,
    welcomeMessage,
    primaryColor,
    secondaryColor,
    launcherText,
    inputPlaceholder
} = window.__CHATBOT_CONFIG__;

/* ===============================
   STATE
================================ */
let SESSION_ID = null;
let started = false;
let isOpen = false;

/* ===============================
   DOM
================================ */
const messages = document.getElementById("messages");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const chatWidget = document.getElementById("chatWidget");
const chatToggle = document.getElementById("chatToggle");
const chatName = document.getElementById("chatName");
const chatAvatar = document.getElementById("chatAvatar");
const launcher = document.getElementById("launcherText");

/* 🛡 Defensa por si el HTML cambia */
if (!messages || !messageInput || !sendBtn || !chatWidget || !chatToggle) {
    console.error("Chatbot DOM incompleto");
    return;
}

/* ===============================
   CONFIG UI
================================ */
if (chatName && name) {
    chatName.textContent = name;
}

if (chatAvatar && avatar) {
    chatAvatar.src = avatar;
    chatAvatar.hidden = false;
}

if (launcher && launcherText) {
    launcher.textContent = launcherText;
}

if (inputPlaceholder) {
    messageInput.placeholder = inputPlaceholder;
}

if (primaryColor) {
    document.documentElement.style.setProperty("--chat-primary", primaryColor);
}

if (secondaryColor) {
    document.documentElement.style.setProperty("--chat-secondary", secondaryColor);
}

/* 🔒 Deshabilitado hasta iniciar sesión */
messageInput.disabled = true;
sendBtn.disabled = true;

/* ===============================
   TOGGLE CHAT
================================ */
chatToggle.onclick = () => {
    isOpen = !isOpen;
    chatWidget.classList.toggle("open", isOpen);

    if (!started) {
        started = true;
        startConversation();
    }
};

/* ===============================
   UI HELPERS
================================ */
function addMessage(from, text) {
    const msg = document.createElement("div");
    msg.className = `msg ${from}`;

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = text; // 🔐 XSS safe

    msg.appendChild(bubble);
    messages.appendChild(msg);
    messages.scrollTop = messages.scrollHeight;

    return msg;
}

/* ⌛ Typing indicator */
function showTyping() {
    return addMessage("bot", "Escribiendo…");
}

function removeTyping(el) {
    if (el) el.remove();
}

/* ===============================
   START CONVERSATION
================================ */
async function startConversation() {
    let typing;

    try {
        /* 👋 Mostrar bienvenida primero (sin typing) */
        if (welcomeMessage) {
            addMessage("bot", welcomeMessage);
        }

        typing = showTyping();

        const res = await fetch(
            `${apiBase}/api/public-chatbot/chatbot-conversation/${publicId}/start`,
            { method: "POST" }
        );

        if (!res.ok) throw new Error("Start conversation failed");

        const data = await res.json();
        SESSION_ID = data.session_id;

        removeTyping(typing);

        if (data.content) {
            addMessage("bot", data.content);
        }

        /* 🔓 Habilitar input */
        messageInput.disabled = false;
        sendBtn.disabled = false;
        messageInput.focus();
    } catch (err) {
        console.error("startConversation error:", err);
        removeTyping(typing);
        addMessage("bot", "No pude iniciar la conversación 😕");
    }
}

/* ===============================
   SEND MESSAGE
================================ */
async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !SESSION_ID) return;

    addMessage("user", text);
    messageInput.value = "";
    sendBtn.disabled = true;

    let typing;

    try {
        typing = showTyping();

        const res = await fetch(
            `${apiBase}/api/public-chatbot/chatbot-conversation/${SESSION_ID}/next`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ input: text })
            }
        );

        if (!res.ok) throw new Error("Send message failed");

        const data = await res.json();
        removeTyping(typing);

        if (data.content) {
            addMessage("bot", data.content);
        }
    } catch (err) {
        console.error("sendMessage error:", err);
        removeTyping(typing);
        addMessage("bot", "Ocurrió un error, intenta de nuevo.");
    } finally {
        sendBtn.disabled = false;
        messageInput.focus();
    }
}

/* ===============================
   EVENTS
================================ */
sendBtn.onclick = sendMessage;

messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        e.preventDefault();
        sendMessage();
    }
});
