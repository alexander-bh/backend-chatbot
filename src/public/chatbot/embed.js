(function () {
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
    if (chatName && name) chatName.textContent = name;
    if (chatAvatar && avatar) {
        chatAvatar.src = avatar;
        chatAvatar.hidden = false;
    }
    if (launcher && launcherText) launcher.textContent = launcherText;
    if (inputPlaceholder) messageInput.placeholder = inputPlaceholder;

    if (primaryColor) {
        document.documentElement.style.setProperty("--chat-primary", primaryColor);
    }
    if (secondaryColor) {
        document.documentElement.style.setProperty("--chat-secondary", secondaryColor);
    }

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
       HELPERS
    ================================ */
    function addMessage(from, text) {
        const msg = document.createElement("div");
        msg.className = `msg ${from}`;

        // Agregar avatar solo para mensajes del bot
        if (from === "bot" && avatar) {
            const avatarImg = document.createElement("img");
            avatarImg.src = avatar;
            avatarImg.className = "msg-avatar";
            msg.appendChild(avatarImg);
        }

        const bubble = document.createElement("div");
        bubble.className = "bubble";
        bubble.textContent = text;

        msg.appendChild(bubble);
        messages.appendChild(msg);
        messages.scrollTop = messages.scrollHeight;
    }

    let typingElement = null;

    function showTyping() {
        if (typingElement) return; // Evitar duplicados

        const msg = document.createElement("div");
        msg.className = "msg bot typing";

        if (avatar) {
            const avatarImg = document.createElement("img");
            avatarImg.src = avatar;
            avatarImg.className = "msg-avatar";
            msg.appendChild(avatarImg);
        }

        const bubble = document.createElement("div");
        bubble.className = "bubble";
        bubble.textContent = "Escribiendo…";

        msg.appendChild(bubble);
        messages.appendChild(msg);
        messages.scrollTop = messages.scrollHeight;

        typingElement = msg;
    }

    function removeTyping() {
        if (typingElement) {
            typingElement.remove();
            typingElement = null;
        }
    }

    /* ===============================
       START
    ================================ */
    async function startConversation() {
        try {
            // Mostrar welcome message solo si existe
            if (welcomeMessage) {
                addMessage("bot", welcomeMessage);
            }

            showTyping();

            const res = await fetch(
                `${apiBase}/api/public-chatbot/chatbot-conversation/${publicId}/start`,
                { method: "POST" }
            );

            if (!res.ok) {
                throw new Error(`Error ${res.status}`);
            }

            const data = await res.json();
            SESSION_ID = data.session_id;

            removeTyping();

            // Solo mostrar el contenido si NO es igual al welcomeMessage
            if (data.content && data.content !== welcomeMessage) {
                addMessage("bot", data.content);
            }

            messageInput.disabled = false;
            sendBtn.disabled = false;
            messageInput.focus();
        } catch (err) {
            console.error(err);
            removeTyping();
            addMessage("bot", "No pude iniciar la conversación 😕");
        }
    }

    async function sendMessage() {
        const text = messageInput.value.trim();
        if (!text || !SESSION_ID) return;

        addMessage("user", text);
        messageInput.value = "";
        messageInput.disabled = true;
        sendBtn.disabled = true;

        try {
            showTyping();

            const res = await fetch(
                `${apiBase}/api/public-chatbot/chatbot-conversation/${SESSION_ID}/next`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ input: text })
                }
            );

            if (!res.ok) {
                throw new Error(`Error ${res.status}`);
            }

            const data = await res.json();
            removeTyping();

            if (data.content) {
                addMessage("bot", data.content);
            }

            if (data.completed) {
                messageInput.disabled = true;
                sendBtn.disabled = true;
            }
        } catch (err) {
            console.error(err);
            removeTyping();
            addMessage("bot", "Ocurrió un error 😕");
        } finally {
            if (!messageInput.disabled) {
                messageInput.disabled = false;
                sendBtn.disabled = false;
                messageInput.focus();
            }
        }
    }

    sendBtn.onclick = sendMessage;
    messageInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
})();