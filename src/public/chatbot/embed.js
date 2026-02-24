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
    function message(from, text, error = false, linkActions = []) {
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

        // Texto base
        const p = document.createElement("div");
        p.textContent = text;
        b.appendChild(p);

        // 🔗 Links
        if (Array.isArray(linkActions)) {
            linkActions.forEach(link => {
                if (link.type !== "link") return;

                const a = document.createElement("a");
                a.href = link.value;
                a.textContent = link.title || link.value;
                a.className = "bubble-link";
                a.target = link.new_tab ? "_blank" : "_self";
                a.rel = "noopener noreferrer";

                b.appendChild(a);
            });
        }

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

    function renderBotMessage(html) {
        const m = document.createElement("div");
        m.className = "msg bot";

        const avatarImg = document.createElement("img");
        avatarImg.src = avatar;
        avatarImg.className = "msg-avatar";

        const contentWrapper = document.createElement("div");
        contentWrapper.className = "msg-content";

        const bubble = document.createElement("div");
        bubble.className = "bubble";
        bubble.innerHTML = html;

        const timeEl = document.createElement("div");
        timeEl.className = "message-time";
        timeEl.textContent = time();

        contentWrapper.append(bubble, timeEl);
        m.append(avatarImg, contentWrapper);
        el.messages.appendChild(m);
        el.messages.scrollTop = el.messages.scrollHeight;

        return bubble;
    }
    function renderInlineOptions(node, bubbleElement) {
        const list = node.type === "policy" ? node.policy : node.options;

        const optionsContainer = document.createElement("div");
        optionsContainer.className = "inline-options";

        list.forEach(o => {
            const btn = document.createElement("button");
            btn.textContent = o.label;
            btn.onclick = () => {
                disableInput();
                send(o.value ?? o.label);
            };
            optionsContainer.appendChild(btn);
        });

        bubbleElement?.appendChild(optionsContainer);
    }

    function expectsTextInput(node) {
        return (
            TEXT_INPUT_TYPES.includes(node.type) ||
            !!node.validation?.rules?.length
        );
    }

    function enableInput() {
        el.input.disabled = false;
        el.send.disabled = false;
        el.input.focus();
    }

    function disableInput() {
        el.input.disabled = true;
        el.send.disabled = true;
    }

    function configureInputForNode(type) {
        el.input.type = "text";
        el.input.placeholder = inputPlaceholder;

        if (type === "email") {
            el.input.type = "email";
            el.input.placeholder = "correo@ejemplo.com";
        }

        if (type === "phone") {
            el.input.type = "tel";
            el.input.placeholder = "Ej. +52 999 123 4567";
        }

        if (type === "number") {
            el.input.type = "number";
        }
    }

    /* =========================
       FLOW
    ========================= */
    async function process(node, depth = 0) {
        if (!node || depth > 20) return;

        console.log("NODE COMPLETO:", node);

        const nodeType = node.type;

        /* =========================
           ERRORES DE VALIDACIÓN
        ========================= */
        if (node.validation_error) {
            message("bot", node.message, true);
            enableInput();
            return;
        }

        /* =========================
           TYPING
        ========================= */
        if (node.typing_time) {
            typing(true);
            await new Promise(r => setTimeout(r, node.typing_time * 1000));
            typing(false);
        }

        /* =========================
           RENDER MENSAJE BOT
        ========================= */
        let bubbleElement = null;

        if (node.content) {
            if (node.link_actions?.length) {
                message("bot", node.content, false, node.link_actions);
            } else {
                bubbleElement = renderBotMessage(node.content);
            }
        }

        /* =========================
           OPTIONS / POLICY
        ========================= */
        if (
            (nodeType === "options" && node.options?.length) ||
            (nodeType === "policy" && node.policy?.length)
        ) {
            renderInlineOptions(node, bubbleElement);
            disableInput();
            return; // 👈 aquí SÍ es correcto
        }

        /* =========================
           NODOS QUE ESPERAN INPUT
        ========================= */
        if (expectsTextInput(node)) {
            configureInputForNode(nodeType);
            enableInput();
            return;
        }

        /* =========================
           AUTO-NEXT (informativo)
        ========================= */
        try {
            const r = await fetch(
                `${apiBase}/api/public-chatbot/chatbot-conversation/${SESSION_ID}/next`,
                { method: "POST" }
            );

            const nextNode = await r.json();
            if (!nextNode?.completed) {
                return process(nextNode, depth + 1);
            }

        } catch (err) {
            message("bot", "Ocurrió un error al continuar el flujo.", true);
        }
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
        console.log("Enviando:", text);


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

    async function restartConversation() {
        if (!publicId) return;

        // Reset estado
        SESSION_ID = null;
        started = false;

        // Limpiar mensajes
        el.messages.innerHTML = "";

        // Reset input
        el.input.value = "";
        el.input.disabled = true;
        el.send.disabled = true;

        // Reset typing
        if (typingElement) {
            typingElement.remove();
            typingElement = null;
        }

        status("Reiniciando…");

        // Iniciar nueva sesión
        started = true;
        await start();
    }

    /* =========================
       EVENTS
    ========================= */
    el.send.onclick = () => send();
    el.input.addEventListener("keydown", e => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
        }
    });
    const welcomeKey = `chat_welcome_seen_${publicId}`;

    el.toggle.onclick = () => {
        isOpen = !isOpen;
        el.widget.classList.toggle("open", isOpen);
        if (isOpen && !started) { started = true; start(); }
        localStorage.setItem(welcomeKey, "1");
    };

    el.close.onclick = el.toggle.onclick;
    el.restart.onclick = () => restartConversation();


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