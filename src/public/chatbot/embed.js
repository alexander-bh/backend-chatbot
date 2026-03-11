(function () {
    /* =========================
       CONFIG
    ========================= */
    const script = document.querySelector('script[data-config]');
    if (!script?.dataset?.config) {
        console.error("CONFIG NO ENCONTRADO");
        return;
    }

    const config = JSON.parse(script.dataset.config);

    const {
        apiBase,
        publicId,
        originDomain,
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

    function scrollToBottom() {
        requestAnimationFrame(() => {
            setTimeout(() => {
                el.messages.scrollTop = el.messages.scrollHeight;
            }, 50);
        });
    }

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

    function isMobileDevice() {
        return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    }

    function renderLinkActions(actions, bubble) {
        if (!Array.isArray(actions) || !bubble) return;

        const container = document.createElement("div");
        container.className = "link-actions";

        actions.forEach(action => {
            const a = document.createElement("a");
            a.className = `link-action link-${action.type}`;
            a.textContent = action.title || action.value;

            switch (action.type) {
                case "link":
                    a.href = action.value;
                    a.target = action.new_tab ? "_blank" : "_self";
                    break;

                case "email": {
                    const email = action.value.trim();
                    const subject = encodeURIComponent("Contacto desde el chatbot");
                    const body = encodeURIComponent("Hola, quiero más información.");

                    a.href = `mailto:${email}?subject=${subject}&body=${body}`;
                    a.target = "_self";

                    break;
                }
                case "phone":
                    a.href = `tel:${action.value}`;
                    a.target = "_self";
                    break;

                case "whatsapp": {
                    const phone = action.value.replace(/\D/g, "");
                    const fullPhone = phone.startsWith("52") ? phone : `52${phone}`;

                    a.href = `https://wa.me/${fullPhone}`;
                    a.target = "_blank"; // 🔥 obligatorio
                    a.rel = "noopener noreferrer";
                    break;
                }

                default:
                    return;
            }

            container.appendChild(a);
        });

        bubble.appendChild(container);
    }

    function openVideoViewer(url) {
        let viewerVideo = imageViewer.querySelector(".viewer-video");
        if (!viewerVideo) {
            viewerVideo = document.createElement("video");
            viewerVideo.className = "viewer-video";
            viewerVideo.controls = true;
            viewerVideo.playsInline = true;
            imageViewer.appendChild(viewerVideo);
        }
        viewerImg.style.display = "none";
        viewerVideo.src = url;
        viewerVideo.style.display = "block";
        imageViewer.classList.add("open");
        viewerVideo.play().catch(() => { });
    }

    function closeImageViewer() {
        imageViewer.classList.remove("open");
        viewerImg.src = "";
        viewerImg.style.display = "";
        const viewerVideo = imageViewer.querySelector(".viewer-video");
        if (viewerVideo) {
            viewerVideo.pause();
            viewerVideo.src = "";
            viewerVideo.style.display = "none";
        }
    }

    function renderMediaCarousel(mediaList, bubbleElement) {
        if (!Array.isArray(mediaList) || !bubbleElement) return;

        const msgEl = bubbleElement.closest(".msg.bot");
        if (msgEl) msgEl.classList.add("media-msg");

        const wrapper = document.createElement("div");
        wrapper.className = "media-carousel-wrapper";

        const MAX_VISIBLE = 4;
        const total = mediaList.length;
        const extra = total - MAX_VISIBLE;

        let countClass = "count-1";
        if (total === 2) countClass = "count-2";
        else if (total === 3) countClass = "count-3";
        else if (total === 4) countClass = "count-4";
        else if (total > 4) countClass = "count-more";

        const grid = document.createElement("div");
        grid.className = `media-grid ${countClass}`;

        mediaList.slice(0, MAX_VISIBLE).forEach((media, index) => {
            const item = document.createElement("div");
            item.className = "media-item";

            const isLast = index === MAX_VISIBLE - 1;
            if (isLast && extra > 0) {
                item.classList.add("has-more-overlay");
                item.dataset.more = `+${extra + 1}`;
            }

            if (media.type === "image") {
                const img = document.createElement("img");
                img.src = media.url;
                img.loading = "lazy";
                item.onclick = () => openImageViewer(media.url);
                item.appendChild(img);
            }

            if (media.type === "video") {
                const video = document.createElement("video");
                video.src = media.url;
                video.playsInline = true;
                video.muted = true;
                video.preload = "metadata";

                if (total === 1) {
                    video.controls = true;
                    item.appendChild(video);
                } else {
                    video.controls = false;
                    item.appendChild(video);

                    const playOverlay = document.createElement("div");
                    playOverlay.className = "video-play-overlay";
                    playOverlay.innerHTML = `
            <svg viewBox="0 0 48 48" width="44" height="44">
                <circle cx="24" cy="24" r="24" fill="rgba(0,0,0,0.5)"/>
                <polygon points="19,14 38,24 19,34" fill="white"/>
            </svg>`;
                    item.appendChild(playOverlay);
                    item.style.cursor = "pointer";
                    item.onclick = () => openVideoViewer(media.url);
                }
            }

            grid.appendChild(item);
        });

        wrapper.appendChild(grid);
        bubbleElement.appendChild(wrapper);
        scrollToBottom();
    }

    const imageViewer = document.createElement("div");
    imageViewer.className = "chat-image-viewer";

    imageViewer.innerHTML = `
    <span class="viewer-close">✕</span>
    <img class="viewer-img" />`;

    document.body.appendChild(imageViewer);

    const viewerImg = imageViewer.querySelector(".viewer-img");
    const viewerClose = imageViewer.querySelector(".viewer-close");

    function openImageViewer(url) {
        viewerImg.src = url;
        imageViewer.classList.add("open");
    }

    function closeImageViewer() {
        imageViewer.classList.remove("open");
        viewerImg.src = "";
    }

    viewerClose.onclick = closeImageViewer;
    document.addEventListener("keydown", e => {
        if (e.key === "Escape") {
            closeImageViewer();
        }
    });
    imageViewer.onclick = e => {
        if (e.target === imageViewer) closeImageViewer();
    };

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
        scrollToBottom();
    }

    function typing(show) {
        if (show && !typingElement) {
            typingElement = document.createElement("div");
            typingElement.className = "msg bot typing";
            typingElement.innerHTML = `<div class="bubble"><span class="typing-dots"><span></span><span></span><span></span></span></div>`;
            el.messages.appendChild(typingElement);
            scrollToBottom(); // ← agregar esto
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

                chatWindow.style.bottom = "20px";  // ← antes era "90px"
                chatWindow.style.right = "20px";
                break;

            case "bottom-left":
                chatButton.style.bottom = "20px";
                chatButton.style.left = "20px";

                chatWindow.style.bottom = "20px";  // ← antes era "90px"
                chatWindow.style.left = "20px";
                break;

            case "middle-right":
                // Botón: se mantiene en el centro derecho
                chatButton.style.top = "50%";
                chatButton.style.right = "20px";
                chatButton.style.transform = "translateY(-50%)";

                // Widget: se abre abajo a la derecha (como bottom-right)
                chatWindow.style.bottom = "20px";
                chatWindow.style.right = "20px";
                chatWindow.style.top = "";           // ← limpiar top
                chatWindow.style.transform = "";     // ← limpiar transform
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
        scrollToBottom();

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
                // Deshabilitar TODOS los botones del contenedor
                optionsContainer.querySelectorAll("button").forEach(b => {
                    b.disabled = true;
                    b.style.opacity = "0.5";
                    b.style.cursor = "not-allowed";
                    b.style.pointerEvents = "none";
                });
                disableInput();
                send(o.value ?? o.label);
            };
            optionsContainer.appendChild(btn);
        });

        bubbleElement?.appendChild(optionsContainer);
    }

    function expectsTextInput(node) {
        const type = node.input_type || node.type;
        return TEXT_INPUT_TYPES.includes(type);
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
            el.input.type = "text";
            el.input.inputMode = "numeric";
        }
    }

    /* =========================
       FLOW
    ========================= */
    async function process(node, depth = 0) {
        console.log("📦 node recibido:", node);
        if (!node || depth > 20) return;

        const nodeType = node.input_type || node.type || node.node_type;

        if (node.validation_error) {
            message("bot", node.message, true);
            const inputType = node.input_type || node.type;
            configureInputForNode(inputType);
            enableInput();
            return;
        }

        if (node.typing_time && node.typing_time > 0) {
            typing(true);
            scrollToBottom();
            await new Promise(r => setTimeout(r, node.typing_time * 1000));
            typing(false);
        }

        if (nodeType === "link") {
            let bubbleElement = null;
            if (node.content) {
                bubbleElement = renderBotMessage(node.content);
            }
            if (node.link_actions?.length && bubbleElement) {
                renderLinkActions(node.link_actions, bubbleElement);
            }
            disableInput();
            return;
        }

        let bubbleElement = null;
        if (node.content) {
            bubbleElement = renderBotMessage(node.content);
        } else {
            bubbleElement = renderBotMessage("");
            bubbleElement.classList.add("media-only");
        }

        if (nodeType === "media" && Array.isArray(node.media)) {
            renderMediaCarousel(node.media, bubbleElement);

            // ✅ Si es el último nodo, no continuar
            if (node.end_conversation) {
                disableInput();
                return;
            }

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
            return;
        }

        if (
            (nodeType === "options" && node.options?.length) ||
            (nodeType === "policy" && node.policy?.length)
        ) {
            renderInlineOptions(node, bubbleElement);
            disableInput();
            return;
        }

        if (expectsTextInput(node)) {
            configureInputForNode(nodeType);
            enableInput();
            return;
        }
        if (node.end_conversation) {
            disableInput();
            return;
        }

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

    async function send(v = null) {
        const text = v ?? el.input.value.trim();
        if (!text || !SESSION_ID) return;
        if (el.send.disabled && v === null) return;

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

            const nextNode = await r.json();
            typing(false);

            // ✅ Si el backend indica que la conversación terminó
            if (nextNode?.completed || nextNode?.end_conversation) {
                disableInput();
                return;
            }

            process(nextNode);

        } catch {
            typing(false);
            message("bot", "Error al enviar el mensaje", true);
            el.input.disabled = false;
            el.send.disabled = false;
        }
    }

    async function start() {
        try {
            typing(true);
            status("Conectando...");
            const r = await fetch(
                `${apiBase}/api/public-chatbot/chatbot-conversation/${publicId}/start`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        origin_url: originDomain
                    })
                }
            );

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
        el.toggle.classList.toggle("active", isOpen);  // ← añade esta línea
        if (isOpen && !started) { started = true; start(); }
        localStorage.setItem(welcomeKey, "1");
    };

    el.close.onclick = () => {
        isOpen = false;
        el.widget.classList.remove("open");
        el.toggle.classList.remove("active");  // ← FAB reaparece al cerrar
    };
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