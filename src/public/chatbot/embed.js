(function () {

    /* =========================
       CONFIG
    ========================= */
    const currentScript = document.currentScript;

    const config = currentScript?.dataset?.config
        ? JSON.parse(currentScript.dataset.config)
        : null;

    if (!config) {
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
        welcomeMessage,
        welcomeDelay,
        showWelcomeOnMobile,
        position
    } = config;


    let SESSION_ID = null;
    let started = false;
    let isOpen = false;

    /* =========================
       DOM ELEMENTS
    ========================= */

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

    const missing = Object.entries(elements)
        .filter(([_, el]) => !el)
        .map(([key]) => key);

    if (missing.length > 0) {
        console.error("[Chatbot] Elementos DOM faltantes:", missing);
        return;
    }

    const welcomeBubble = elements.welcomeBubble;
    let currentExpectedType = null;



    /* =========================
       HELPERS
    ========================= */

    function isValidEmail(value) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }

    function isValidPhone(value) {
        return /^[0-9+\s()-]{7,}$/.test(value.trim());
    }

    function isValidNumber(value) {
        return value.trim() !== "" && !isNaN(value);
    }

    function hexToRgb(hex) {
        if (!hex || !/^#([A-Fa-f0-9]{6})$/.test(hex)) {
            return "37, 99, 235";
        }

        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `${r}, ${g}, ${b}`;
    }

    function formatTime(date = new Date()) {
        return date.toLocaleTimeString("es-MX", {
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    /* =========================
       THEME INIT
    ========================= */

    const primaryRgb = hexToRgb(primaryColor);
    const secondaryRgb = hexToRgb(secondaryColor);

    document.documentElement.style.setProperty("--chat-primary-rgb", primaryRgb);
    document.documentElement.style.setProperty("--chat-secondary-rgb", secondaryRgb);

    if (primaryColor) {
        document.documentElement.style.setProperty("--chat-primary", primaryColor);
    }

    if (secondaryColor) {
        document.documentElement.style.setProperty("--chat-secondary", secondaryColor);
    }

    if (elements.chatName && name) elements.chatName.textContent = name;
    if (elements.chatAvatarFab && avatar) elements.chatAvatarFab.src = avatar;
    if (elements.chatAvatarHeader && avatar) elements.chatAvatarHeader.src = avatar;
    if (inputPlaceholder) elements.messageInput.placeholder = inputPlaceholder;

    elements.messageInput.disabled = true;
    elements.sendBtn.disabled = true;

    function applyPosition(position) {
        const chatButton = elements.chatToggle;
        const chatWindow = elements.chatWidget;
        const welcome = elements.welcomeBubble;

        if (!chatButton || !chatWindow) return;

        ["top", "bottom", "left", "right"].forEach(prop => {
            chatButton.style[prop] = "";
            chatWindow.style[prop] = "";
            if (welcome) welcome.style[prop] = "";
        });

        switch (position) {
            case "bottom-right":
                chatButton.style.bottom = "20px";
                chatButton.style.right = "20px";

                chatWindow.style.bottom = "90px";
                chatWindow.style.right = "20px";
                break;

            case "bottom-left":
                chatButton.style.bottom = "20px";
                chatButton.style.left = "20px";

                chatWindow.style.bottom = "90px";
                chatWindow.style.left = "20px";
                break;

            case "middle-right":
                chatButton.style.top = "50%";
                chatButton.style.right = "20px";
                chatButton.style.transform = "translateY(-50%)";

                chatWindow.style.top = "50%";
                chatWindow.style.right = "90px";
                chatWindow.style.transform = "translateY(-50%)";
                break;
        }
    }


    if (position) {
        applyPosition(position);
    }

    function isMobile() {
        return window.matchMedia("(max-width: 480px)").matches;
    }

    /* =========================
       UI HELPERS
    ========================= */

    function addMessage(from, text, isError = false) {
        const msg = document.createElement("div");
        msg.className = `msg ${from}${isError ? " error" : ""}`;

        if (from === "bot" && avatar) {
            const avatarImg = document.createElement("img");
            avatarImg.src = avatar;
            avatarImg.className = "msg-avatar";
            msg.appendChild(avatarImg);
        }
        const content = document.createElement("div");
        content.className = "msg-content";

        const bubble = document.createElement("div");
        bubble.className = "bubble";
        bubble.textContent = text;

        const time = document.createElement("div");
        time.className = "message-time";
        time.textContent = formatTime();

        console.log("Mensaje:", text, "Error:", isError);

        content.appendChild(bubble);
        content.appendChild(time);
        msg.appendChild(content);

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
    }

    let typingElement = null;

    function showTyping() {
        if (typingElement) return;

        const msg = document.createElement("div");
        msg.className = "msg bot typing";

        const bubble = document.createElement("div");
        bubble.className = "bubble";
        bubble.innerHTML = `
            <span class="typing-dots">
                <span></span><span></span><span></span>
            </span>
        `;

        msg.appendChild(bubble);
        elements.messages.appendChild(msg);
        typingElement = msg;
    }

    function removeTyping() {
        if (typingElement) {
            typingElement.remove();
            typingElement = null;
        }
    }

    function setStatus(text) {
        if (elements.chatStatus) elements.chatStatus.textContent = text;

        document.documentElement.style.setProperty(
            "--chat-pulse-rgb",
            text === "En línea" ? primaryRgb : secondaryRgb
        );
    }

    /* =========================
       CHAT FLOW
    ========================= */

    const INPUT_TYPES = ["question", "email", "phone", "number", "text_input"];

    async function processNode(data, depth = 0) {
        if (!data || depth > 20) return;

        if (data.typing_time) {
            showTyping();
            await new Promise(r => setTimeout(r, data.typing_time * 1000));
            removeTyping();
        }

        if (data.content) addMessage("bot", data.content);

        if (data.options?.length) {
            addOptions(data.options);
            return;
        }

        if (data.link_action) window.open(data.link_action, "_blank");

        const requiresInput =
            INPUT_TYPES.includes(data.type) || data.input_type;
        if (requiresInput) {
            currentExpectedType = data.type;
        }

        if (!requiresInput && !data.completed) {
            const res = await fetch(
                `${apiBase}/api/public-chatbot/chatbot-conversation/${data.session_id}/next`,
                { method: "POST", headers: { "Content-Type": "application/json" } }
            );
            return processNode(await res.json(), depth + 1);
        }

        if (!data.completed) {
            elements.messageInput.disabled = false;
            elements.sendBtn.disabled = false;
        }
    }

    async function startConversation() {
        try {
            showTyping();
            setStatus("Conectando...");

            const res = await fetch(
                `${apiBase}/api/public-chatbot/chatbot-conversation/${publicId}/start`,
                { method: "POST" }
            );

            if (!res.ok) throw new Error("Start failed");

            const data = await res.json();

            if (!data.session_id) {
                throw new Error("No session id");
            }

            SESSION_ID = data.session_id;

            removeTyping();
            setStatus("En línea");

            await processNode(data);

        } catch {
            removeTyping();
            setStatus("Error");
            addMessage("bot", "No pude conectarme al servidor.", true);
        }
    }

    async function restartConversation() {
        if (!publicId) return;

        // Reset estados
        SESSION_ID = null;
        started = false;
        currentExpectedType = null;

        // Limpiar mensajes
        elements.messages.innerHTML = "";

        // Deshabilitar input mientras reinicia
        elements.messageInput.disabled = true;
        elements.sendBtn.disabled = true;

        // Iniciar nueva conversación
        started = true;
        await startConversation();
    }

    async function sendMessage(inputOverride = null) {
        const text = inputOverride ?? elements.messageInput.value.trim();
        if (!text || !SESSION_ID) return;

        const invalid =
            (currentExpectedType === "email" && !isValidEmail(text)) ||
            (currentExpectedType === "phone" && !isValidPhone(text)) ||
            (currentExpectedType === "number" && !isValidNumber(text));

        if (invalid) {
            let errorMsg = "El dato ingresado no es válido.";

            if (currentExpectedType === "email") {
                errorMsg = "Ingresa un email válido.";
            }

            if (currentExpectedType === "phone") {
                errorMsg = "Ingresa un número de teléfono válido.";
            }

            if (currentExpectedType === "number") {
                errorMsg = "Ingresa un número válido.";
            }

            addMessage("bot", errorMsg, true);
            return;
        }

        currentExpectedType = null;

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
        } catch {
            removeTyping();
            addMessage("bot", "Error al procesar tu mensaje.", true);
        }
    }

    /* =========================
       EVENTS
    ========================= */

    elements.sendBtn.onclick = () => sendMessage();

    elements.messageInput.addEventListener("keydown", e => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    const welcomeKey = `chat_welcome_seen_${publicId}`;
    let welcomeShown = localStorage.getItem(welcomeKey) === "1";

    function toggleChat() {
        isOpen = !isOpen;

        elements.chatWidget.classList.toggle("open", isOpen);
        elements.chatToggle.classList.toggle("active", isOpen);

        if (isOpen && welcomeBubble) {
            welcomeBubble.classList.remove("show");
            localStorage.setItem(welcomeKey, "1"); // 👈 FIX SaaS
            welcomeShown = true;
        }

        if (isOpen && !started) {
            started = true;
            startConversation();
        }
    }


    elements.chatToggle.onclick = toggleChat;
    if (elements.chatClose) elements.chatClose.onclick = toggleChat;
    if (elements.chatRestart) {
        elements.chatRestart.onclick = restartConversation;
    }
    if (!welcomeShown && welcomeMessage) {
        const delay = (welcomeDelay ?? 2) * 1000;

        setTimeout(() => {
            if (
                !elements.chatWidget.classList.contains("open") &&
                (!isMobile() || showWelcomeOnMobile)
            ) {
                const textEl = welcomeBubble?.querySelector(".welcome-text");

                if (textEl) {
                    textEl.textContent = welcomeMessage;
                }

                if (welcomeBubble) {
                    welcomeBubble.style.display = "block";
                }

                localStorage.setItem(welcomeKey, "1");
                welcomeShown = true;
            }
        }, delay);
    }

    window.addEventListener("resize", () => {
        if (position) {
            applyPosition(position);
        }
    });
})();