(function () {
    /* =========================
       CONFIG
    ========================= */
    const script = document.currentScript;
    if (!script?.dataset?.config) return;

    const config = JSON.parse(script.dataset.config);

    const {
        apiBase,
        publicId,
        name,
        avatar,
        primaryColor,
        secondaryColor,
        inputPlaceholder,
        welcomeMessage,
        welcomeDelay = 2,
        showWelcomeOnMobile,
        position
    } = config;

    const TEXT_INPUT_TYPES = [
        "question",
        "email",
        "phone",
        "number",
        "text_input"
    ];

    const SELECTABLE_TYPES = [
        "options",
        "policy"
    ];

    let SESSION_ID = null;
    let started = false;
    let isOpen = false;
    let currentValidation = null;
    let typingElement = null;

    /* =========================
       DOM
    ========================= */
    const el = {
        messages: document.getElementById("messages"),
        input: document.getElementById("messageInput"),
        send: document.getElementById("sendBtn"),
        widget: document.getElementById("chatWidget"),
        toggle: document.getElementById("chatToggle"),
        close: document.getElementById("chatClose"),
        name: document.getElementById("chatName"),
        avatarFab: document.getElementById("chatAvatarFab"),
        avatarHeader: document.getElementById("chatAvatarHeader"),
        status: document.getElementById("chatStatus"),
        welcome: document.getElementById("chatWelcome"),
        restart: document.getElementById("chatRestart")
    };

    if (Object.values(el).some(v => !v)) return;

    /* =========================
       HELPERS
    ========================= */
    const email = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    const phone = v => /^[0-9]{7,15}$/.test(v);
    const phoneMX = v => /^\+52\d{10}$/.test(v);
    const phoneIntl = v => /^\+\d{8,15}$/.test(v);
    const whatsapp = v => /^\+?\d{8,15}$/.test(v);
    const url = v => { try { new URL(v); return true; } catch { return false; } };

    const rgb = hex => {
        if (!/^#[\da-f]{6}$/i.test(hex)) return "37,99,235";
        return `${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5), 16)}`;
    };

    const time = () =>
        new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });

    const mobile = () => matchMedia("(max-width:480px)").matches;

    /* =========================
       THEME
    ========================= */
    document.documentElement.style.setProperty("--chat-primary", primaryColor);
    document.documentElement.style.setProperty("--chat-secondary", secondaryColor);
    document.documentElement.style.setProperty("--chat-primary-rgb", rgb(primaryColor));
    document.documentElement.style.setProperty("--chat-secondary-rgb", rgb(secondaryColor));

    el.name.textContent = name;
    el.avatarFab.src = el.avatarHeader.src = avatar;
    el.input.placeholder = inputPlaceholder;

    el.input.disabled = el.send.disabled = true;


    /* =========================
       UI
    ========================= */
    function message(from, text, error = false) {
        const m = document.createElement("div");
        m.className = `msg ${from}${error ? " error" : ""}`;

        if (from === "bot") {
            const a = document.createElement("img");
            a.src = avatar;
            a.className = "msg-avatar";
            m.appendChild(a);
        }

        const c = document.createElement("div");
        c.className = "msg-content";

        const b = document.createElement("div");
        b.className = "bubble";
        b.textContent = text;

        const t = document.createElement("div");
        t.className = "message-time";
        t.textContent = time();

        c.append(b, t);
        m.appendChild(c);
        el.messages.appendChild(m);
        el.messages.scrollTop = el.messages.scrollHeight;
    }

    function typing(show) {
        if (show && !typingElement) {
            typingElement = document.createElement("div");
            typingElement.className = "msg bot typing";
            typingElement.innerHTML = `<div class="bubble"><span class="typing-dots"><span></span><span></span><span></span></span></div>`;
            el.messages.appendChild(typingElement);
        }
        if (!show && typingElement) {
            typingElement.remove();
            typingElement = null;
        }
    }

    function status(s) {
        el.status.textContent = s;
        document.documentElement.style.setProperty(
            "--chat-pulse-rgb",
            s === "En línea" ? rgb(primaryColor) : rgb(secondaryColor)
        );
    }

    function applyPosition(position) {
        const chatButton = el.toggle;
        const chatWindow = el.widget;
        const welcome = el.welcome;

        if (!chatButton || !chatWindow) return;

        ["top", "bottom", "left", "right"].forEach(prop => {
            chatButton.style[prop] = "";
            chatWindow.style[prop] = "";
            if (welcome) welcome.style[prop] = "";
        });

        chatButton.style.transform = "";
        chatWindow.style.transform = "";

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

    function renderOptions(options) {
        const container = document.createElement("div");
        container.className = "inline-options";

        options.forEach(opt => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "option-btn";
            btn.textContent = opt.label;

            btn.onclick = () => {
                // bloquear múltiples clicks
                container.querySelectorAll("button").forEach(b => b.disabled = true);

                // mostrar como mensaje usuario
                message("user", opt.label);

                send(opt.value);
            };

            container.appendChild(btn);
        });

        el.messages.appendChild(container);
        el.messages.scrollTop = el.messages.scrollHeight;
    }

    function renderPolicy(policy) {
        const container = document.createElement("div");
        container.className = "inline-options";

        policy.forEach(opt => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "option-btn policy-btn";
            btn.textContent = opt.label;

            btn.onclick = () => {
                container.querySelectorAll("button").forEach(b => b.disabled = true);

                message("user", opt.label);

                send(opt.value);
            };

            container.appendChild(btn);
        });

        el.messages.appendChild(container);
        el.messages.scrollTop = el.messages.scrollHeight;
    }

    function renderLinkActions(actions) {
        const container = document.createElement("div");
        container.className = "inline-options";

        actions.forEach(action => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "option-btn link-btn";
            btn.textContent = action.label;

            btn.onclick = () => {
                if (action.url) {
                    window.open(action.url, "_blank");
                }

                if (action.value) {
                    message("user", action.label);
                    send(action.value);
                }
            };

            container.appendChild(btn);
        });

        el.messages.appendChild(container);
        el.messages.scrollTop = el.messages.scrollHeight;
    }

    async function nextStep() {
        if (!SESSION_ID) return;

        typing(true);

        try {
            const r = await fetch(
                `${apiBase}/api/public-chatbot/chatbot-conversation/${SESSION_ID}/next`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({})
                }
            );

            typing(false);

            const data = await r.json();
            process(data);

        } catch {
            typing(false);
            message("bot", "Error al continuar la conversación", true);
        }
    }

    /* =========================
       FLOW
    ========================= */
    function process(node) {
        if (!node) return;

        const nodeType = node.type;

        document.querySelectorAll(".inline-options").forEach(el => el.remove());

        el.input.value = "";
        el.input.disabled = true;
        el.send.disabled = true;
        el.input.style.pointerEvents = "auto";

        currentValidation = null;

        if (node.validation?.rules?.length) {
            currentValidation = node.validation;
        }

        /* 🔥 MOSTRAR MENSAJE DEL BOT */
        if (node.content) {
            message("bot", node.content, node.is_error || false);
        }

        const TEXT_INPUT_TYPES = [
            "question",
            "email",
            "phone",
            "number",
            "text_input"
        ];

        const isInputNode = TEXT_INPUT_TYPES.includes(nodeType);
        const isOptionsNode = nodeType === "options";
        const isPolicyNode = nodeType === "policy";
        const isLinkNode = nodeType === "link";

        if (isOptionsNode && Array.isArray(node.options)) {
            renderOptions(node.options);
            return;
        }

        if (isPolicyNode && Array.isArray(node.policy)) {
            renderPolicy(node.policy);
            return;
        }

        if (isLinkNode && Array.isArray(node.link_actions)) {
            renderLinkActions(node.link_actions);
            return;
        }

        if (isInputNode) {
            el.input.disabled = false;
            el.send.disabled = false;
            el.input.focus();
            return;
        }

        setTimeout(() => {
            nextStep();
        }, node.typing_time || 500);
    }
    
    async function start() {
        try {
            typing(true);
            status("Conectando...");
            const r = await fetch(`${apiBase}/api/public-chatbot/chatbot-conversation/${publicId}/start`, { method: "POST" });
            const d = await r.json();
            SESSION_ID = d.session_id;
            typing(false);
            status("En línea");
            process(d);
        } catch {
            typing(false);
            status("Error");
            message("bot", "No pude conectarme al servidor", true);
        }
    }

    async function send(v = null) {
        const text = v ?? el.input.value.trim();
        if (!text || !SESSION_ID) return;

        if (currentValidation?.rules) {
            for (const r of currentValidation.rules) {

                let valid = true;

                if (r.type === "email") valid = email(text);
                if (r.type === "phone") valid = phone(text);
                if (r.type === "phone_mx") valid = phoneMX(text);
                if (r.type === "phone_country") valid = phoneIntl(text);
                if (r.type === "whatsapp") valid = whatsapp(text);
                if (r.type === "link") valid = url(text);

                if (!valid) {
                    message("bot", r.message, true);

                    // 🔑 REACTIVAR INPUT
                    el.input.disabled = false;
                    el.send.disabled = false;
                    el.input.focus();

                    return;
                }
            }
        }

        if (v === null) {
            message("user", text);
            el.input.value = "";
        }

        el.input.disabled = el.send.disabled = true;
        typing(true);

        try {
            const r = await fetch(
                `${apiBase}/api/public-chatbot/chatbot-conversation/${SESSION_ID}/next`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ input: text })
                }
            );

            typing(false);
            process(await r.json());

        } catch {
            typing(false);
            message("bot", "Error al enviar el mensaje", true);
            el.input.disabled = false;
            el.send.disabled = false;
        }
    }

    /* =========================
       EVENTS
    ========================= */
    el.send.onclick = () => send();
    el.input.onkeydown = e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send());

    const welcomeKey = `chat_welcome_seen_${publicId}`;

    el.toggle.onclick = () => {
        isOpen = !isOpen;
        el.widget.classList.toggle("open", isOpen);
        if (isOpen && !started) { started = true; start(); }
        localStorage.setItem(welcomeKey, "1");
    };

    el.close.onclick = el.toggle.onclick;
    el.restart.onclick = () => location.reload();


    if (position) {
        applyPosition(position);
    }

    if (!localStorage.getItem(welcomeKey) && welcomeMessage) {
        setTimeout(() => {
            if (!isOpen && (!mobile() || showWelcomeOnMobile)) {
                el.welcome.querySelector(".welcome-text").textContent = welcomeMessage;
                el.welcome.style.display = "block";
                localStorage.setItem(welcomeKey, "1");
            }
        }, welcomeDelay * 1000);
    }
})();