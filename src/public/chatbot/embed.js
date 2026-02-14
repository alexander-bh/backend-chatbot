(function () {

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
        inputPlaceholder,
        welcomeMessage
    } = window.__CHATBOT_CONFIG__;

    let SESSION_ID = null;
    let started = false;
    let isOpen = false;

    const elements = {
        messages: document.getElementById("messages"),
        messageInput: document.getElementById("messageInput"),
        sendBtn: document.getElementById("sendBtn"),
        chatWidget: document.getElementById("chatWidget"),
        chatToggle: document.getElementById("chatToggle"),
        chatClose: document.getElementById("chatClose"),
        chatName: document.getElementById("chatName"),
        chatAvatarFab: document.getElementById("chatAvatarFab"),
        chatAvatarHeader: document.getElementById("chatAvatarHeader"),
        chatStatus: document.getElementById("chatStatus"),
        welcomeBubble: document.getElementById("chatWelcome"),
        chatRestart: document.getElementById("chatRestart"),
    };

    // ✅ alias correcto
    const welcomeBubble = elements.welcomeBubble;
    const required = ["messages", "messageInput", "sendBtn", "chatWidget", "chatToggle"];
    const missing = required.filter(key => !elements[key]);


    function hexToRgb(hex) {
        if (!hex || !/^#([A-Fa-f0-9]{6})$/.test(hex)) {
            return "37, 99, 235";
        }

        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `${r}, ${g}, ${b}`;
    }

    const primaryRgb = hexToRgb(primaryColor);
    const secondaryRgb = hexToRgb(secondaryColor);

    if (primaryColor) {
        document.documentElement.style.setProperty("--chat-primary-rgb", primaryRgb);
    }

    if (secondaryColor) {
        document.documentElement.style.setProperty("--chat-secondary-rgb", secondaryRgb);
    }


    if (missing.length > 0) {
        console.error("[Chatbot] Elementos DOM faltantes:", missing);
        return;
    }

    if (elements.chatName && name) {
        elements.chatName.textContent = name;
    }

    if (elements.chatAvatarFab && avatar) {
        elements.chatAvatarFab.src = avatar;
    }

    if (elements.chatAvatarHeader && avatar) {
        elements.chatAvatarHeader.src = avatar;
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

    if (elements.chatRestart) {
        elements.chatRestart.addEventListener("click", restartConversation);
    }

    elements.messageInput.disabled = true;
    elements.sendBtn.disabled = true;

    let welcomeShown = localStorage.getItem("chat_welcome_seen") === "1";

    function toggleChat() {
        isOpen = !isOpen;

        elements.chatWidget.classList.toggle("open", isOpen);
        elements.chatToggle.classList.toggle("active", isOpen);

        if (isOpen && welcomeBubble) {
            welcomeBubble.classList.remove("show");
            localStorage.setItem("chat_welcome_seen", "1");
            welcomeShown = true;
        }

        if (isOpen && !started) {
            started = true;
            startConversation();
        }
    }


    elements.chatToggle.onclick = toggleChat;
    if (elements.chatClose) {
        elements.chatClose.onclick = toggleChat;
    }
    if (elements.chatRestart) {
        elements.chatRestart.onclick = restartConversation;
    }


    function showWelcomeOutside() {
        if (!welcomeMessage || welcomeShown || !welcomeBubble) return;

        const textEl = welcomeBubble.querySelector(".welcome-text");
        if (!textEl) return;

        textEl.textContent = welcomeMessage;
        welcomeBubble.classList.add("show");
    }

    function formatTime(date = new Date()) {
        return date.toLocaleTimeString("es-MX", {
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function addMessage(from, text, isError = false) {
        const msg = document.createElement("div");
        msg.className = `msg ${from}${isError ? ' error' : ''}`;

        if (from === "bot" && avatar && !isError) {
            const avatarImg = document.createElement("img");
            avatarImg.src = avatar;
            avatarImg.className = "msg-avatar";
            msg.appendChild(avatarImg);
        }

        const contentWrapper = document.createElement("div");
        contentWrapper.className = "msg-content";

        const bubble = document.createElement("div");
        bubble.className = "bubble";
        bubble.textContent = text;

        const time = document.createElement("div");
        time.className = "message-time";
        time.textContent = formatTime();

        contentWrapper.appendChild(bubble);
        contentWrapper.appendChild(time);

        msg.appendChild(contentWrapper);

        elements.messages.appendChild(msg);
        elements.messages.scrollTop = elements.messages.scrollHeight;
    }


    function addOptions(options) {
        const msg = document.createElement("div");
        msg.className = "msg bot";

        const bubble = document.createElement("div");
        bubble.className = "bubble options";

        options.forEach(opt => {
            const btn = document.createElement("button");
            btn.textContent = opt.label;

            btn.onclick = () => {
                sendMessage(opt.index);
                msg.remove();
            };

            bubble.appendChild(btn);
        });

        msg.appendChild(bubble);
        elements.messages.appendChild(msg);
        elements.messages.scrollTop = elements.messages.scrollHeight;
    }

    let typingElement = null;

    function showTyping() {
        if (typingElement) return;

        const msg = document.createElement("div");
        msg.className = "msg bot typing";

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

    const INPUT_TYPES = ["question", "email", "phone", "number", "text_input"];

    async function processNode(data, depth = 0) {

        if (!data || depth > 20) return;

        if (data.typing_time) {
            showTyping();
            await new Promise(r => setTimeout(r, data.typing_time * 1000));
            removeTyping();
        }

        if (data.content) {
            addMessage("bot", data.content);
        }

        if (data.options?.length) {
            addOptions(data.options);
            return;
        }

        if (data.link_action) {
            window.open(data.link_action, "_blank");
        }

        const requiresInput =
            INPUT_TYPES.includes(data.type) ||
            data.input_type;

        if (!requiresInput && !data.completed) {

            const res = await fetch(
                `${apiBase}/api/public-chatbot/chatbot-conversation/${data.session_id}/next`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({})
                }
            );

            const nextData = await res.json();
            return processNode(nextData, depth + 1);
        }

        if (!data.completed) {
            elements.messageInput.disabled = false;
            elements.sendBtn.disabled = false;
        }
    }

    function setStatus(text) {
        if (elements.chatStatus) {
            elements.chatStatus.textContent = text;
        }

        const root = document.documentElement;
        const isOnline = text === "En línea";

        // Cambiar color del pulso
        root.style.setProperty(
            "--chat-pulse-rgb",
            isOnline ? primaryRgb : secondaryRgb
        );
    }

    async function restartConversation() {

        if (!SESSION_ID) return;
        if (!confirm("¿Deseas reiniciar la conversación?")) return;

        elements.messages.innerHTML = "";

        SESSION_ID = null;
        started = false;

        elements.messageInput.value = "";
        elements.messageInput.disabled = true;
        elements.sendBtn.disabled = true;

        setStatus("Conectando...");

        started = true;
        await startConversation();
    }


    async function startConversation() {
        try {
            showTyping();
            setStatus("Conectando...");

            const res = await fetch(
                `${apiBase}/api/public-chatbot/chatbot-conversation/${publicId}/start`,
                { method: "POST" }
            );

            const data = await res.json();

            SESSION_ID = data.session_id;

            removeTyping();
            setStatus("En línea");

            await processNode(data);

        } catch (err) {

            removeTyping();
            setStatus("Error");

            addMessage(
                "bot",
                "No pude conectarme al servidor.",
                true
            );
        }
    }

    async function sendMessage(inputOverride = null) {

        const text = inputOverride !== null
            ? inputOverride
            : elements.messageInput.value.trim();

        if (!text || !SESSION_ID) return;

        if (inputOverride === null) {
            addMessage("user", text);
            elements.messageInput.value = "";
        }

        elements.messageInput.disabled = true;
        elements.sendBtn.disabled = true;

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

            const data = await res.json();

            removeTyping();

            await processNode(data);

        } catch (err) {

            removeTyping();

            addMessage(
                "bot",
                "Error al procesar tu mensaje.",
                true
            );
        }
    }

    elements.sendBtn.onclick = () => sendMessage();

    elements.messageInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    if (welcomeBubble && !welcomeShown) {
        setTimeout(showWelcomeOutside, 1200);
    }
})();

