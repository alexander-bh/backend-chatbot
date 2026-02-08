(function () {
    /* ===============================
       VALIDACIÓN GLOBAL
    ================================ */
    if (!window.__CHATBOT_CONFIG__) {
        console.error("[Chatbot] Config no encontrada");
        return;
    }

    const {
        apiBase,
        publicId,
        name,
        avatar,
        primaryColor,
        secondaryColor,
        inputPlaceholder
    } = window.__CHATBOT_CONFIG__;

    console.log("[Chatbot] Inicializando con config:", {
        apiBase,
        publicId,
        name
    });

    /* ===============================
       STATE
    ================================ */
    let SESSION_ID = null;
    let started = false;
    let isOpen = false;

    /* ===============================
       DOM
    ================================ */
    const elements = {
        messages: document.getElementById("messages"),
        messageInput: document.getElementById("messageInput"),
        sendBtn: document.getElementById("sendBtn"),
        chatWidget: document.getElementById("chatWidget"),
        chatToggle: document.getElementById("chatToggle"),
        chatClose: document.getElementById("chatClose"),
        chatName: document.getElementById("chatName"),
        chatAvatar: document.getElementById("chatAvatar"),
        chatStatus: document.getElementById("chatStatus")
    };

    // Validar elementos críticos
    const required = ["messages", "messageInput", "sendBtn", "chatWidget", "chatToggle"];
    const missing = required.filter(key => !elements[key]);

    if (missing.length > 0) {
        console.error("[Chatbot] Elementos DOM faltantes:", missing);
        return;
    }

    const originalIcon = elements.chatToggle.innerHTML;

    /* ===============================
       CONFIG UI
    ================================ */
    if (elements.chatName && name) {
        elements.chatName.textContent = name;
    }

    if (elements.chatAvatar && avatar) {
        elements.chatAvatar.src = avatar;
        elements.chatAvatar.hidden = false;
    }

    if (inputPlaceholder) {
        elements.messageInput.placeholder = inputPlaceholder;
    }

    if (primaryColor) {
        document.documentElement.style.setProperty("--chat-primary", primaryColor);
    }

    if (secondaryColor) {
        document.documentElement.style.setProperty("--chat-secondary", secondaryColor);
    }

    elements.messageInput.disabled = true;
    elements.sendBtn.disabled = true;

    /* ===============================
       TOGGLE CHAT
    ================================ */
    function toggleChat() {
        isOpen = !isOpen;

        elements.chatWidget.classList.toggle("open", isOpen);
        elements.chatToggle.classList.toggle("active", isOpen);

        elements.chatToggle.innerHTML = isOpen
            ? '<span style="font-size:26px;line-height:1">✕</span>'
            : originalIcon;

        if (!isOpen) {
            elements.messageInput.blur();
        }

        if (isOpen && !elements.messageInput.disabled) {
            elements.messageInput.focus();
        }

        // Iniciar solo una vez
        if (isOpen && !started) {
            started = true;
            startConversation();
        }
    }

    elements.chatToggle.onclick = toggleChat;

    if (elements.chatClose) {
        elements.chatClose.onclick = toggleChat;
    }

    elements.chatToggle.onclick = toggleChat;

    if (elements.chatClose) {
        elements.chatClose.onclick = toggleChat;
    }

    /* ===============================
       HELPERS
    ================================ */
    function addMessage(from, text, isError = false) {
        const msg = document.createElement("div");
        msg.className = `msg ${from}${isError ? ' error' : ''}`;

        if (from === "bot" && avatar && !isError) {
            const avatarImg = document.createElement("img");
            avatarImg.src = avatar;
            avatarImg.className = "msg-avatar";
            msg.appendChild(avatarImg);
        }

        const bubble = document.createElement("div");
        bubble.className = "bubble";
        bubble.textContent = text;

        msg.appendChild(bubble);
        elements.messages.appendChild(msg);

        elements.messages.scrollTop = elements.messages.scrollHeight;
    }

    let typingElement = null;

    function showTyping() {
        if (typingElement) return;

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
        elements.messages.appendChild(msg);

        elements.messages.scrollTop = elements.messages.scrollHeight;

        typingElement = msg;
    }

    function removeTyping() {
        if (typingElement) {
            typingElement.remove();
            typingElement = null;
        }
    }

    function setStatus(text) {
        if (elements.chatStatus) {
            elements.chatStatus.textContent = text;
        }
    }

    /* ===============================
       START CONVERSATION
    ================================ */
    async function startConversation() {
        try {
            console.log("[Chatbot] Iniciando conversación...");

            showTyping();
            setStatus("Conectando...");

            const url = `${apiBase}/api/public-chatbot/chatbot-conversation/${publicId}/start`;
            console.log("[Chatbot] URL:", url);

            const res = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                }
            });

            console.log("[Chatbot] Respuesta:", res.status);

            if (!res.ok) {
                const errorText = await res.text();
                console.error("[Chatbot] Error del servidor:", errorText);
                throw new Error(`Error ${res.status}: ${errorText}`);
            }

            const data = await res.json();
            console.log("[Chatbot] Datos recibidos:", data);

            SESSION_ID = data.session_id;

            removeTyping();
            setStatus("En línea");

            // Mostrar mensaje inicial si existe
            if (data.content) {
                addMessage("bot", data.content);
            }

            elements.messageInput.disabled = false;
            elements.sendBtn.disabled = false;

            if (isOpen) {
                elements.messageInput.focus();
            }

        } catch (err) {
            console.error("[Chatbot] Error al iniciar:", err);

            removeTyping();
            setStatus("Error de conexión");

            addMessage(
                "bot",
                "No pude conectarme al servidor. Por favor, intenta más tarde.",
                true
            );
        }
    }

    /* ===============================
       SEND MESSAGE
    ================================ */
    async function sendMessage() {
        const text = elements.messageInput.value.trim();

        if (!text || !SESSION_ID) {
            console.warn("[Chatbot] No hay texto o sesión");
            return;
        }

        console.log("[Chatbot] Enviando:", text);

        addMessage("user", text);

        elements.messageInput.value = "";
        elements.messageInput.disabled = true;
        elements.sendBtn.disabled = true;

        let completed = false;

        try {
            showTyping();

            const url = `${apiBase}/api/public-chatbot/chatbot-conversation/${SESSION_ID}/next`;
            console.log("[Chatbot] Next URL:", url);

            const res = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ input: text })
            });

            console.log("[Chatbot] Next response:", res.status);

            if (!res.ok) {
                const errorText = await res.text();
                console.error("[Chatbot] Error en next:", errorText);
                throw new Error(`Error ${res.status}`);
            }

            const data = await res.json();
            console.log("[Chatbot] Next data:", data);

            removeTyping();

            if (data.content) {
                addMessage("bot", data.content);
            }

            if (data.completed) {
                completed = true;
                setStatus("Conversación finalizada");
                elements.messageInput.disabled = true;
                elements.sendBtn.disabled = true;
            }

        } catch (err) {
            console.error("[Chatbot] Error al enviar:", err);

            removeTyping();

            addMessage(
                "bot",
                "Ocurrió un error al procesar tu mensaje.",
                true
            );

        } finally {
            if (!completed) {
                elements.messageInput.disabled = false;
                elements.sendBtn.disabled = false;

                if (isOpen) {
                    elements.messageInput.focus();
                }
            }
        }
    }

    /* ===============================
       EVENTS
    ================================ */
    elements.sendBtn.onclick = sendMessage;

    elements.messageInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    console.log("[Chatbot] Widget listo");

})();