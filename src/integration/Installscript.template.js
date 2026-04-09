(function () {
    var BASE = "{{BASE_URL}}";
    var PID = "{{PUBLIC_ID}}";
    var POSITION = "{{POSITION}}";
    var SECONDARYCOLOR = "{{SECONDARY_COLOR}}";

    // ── Instancia única ──
    var INSTANCE_KEY = "__CHATBOT_INSTALLED__" + PID;
    if (window[INSTANCE_KEY]) {
        var ex = document.getElementById("chatbot_" + PID);
        if (ex) return;
    }

    window[INSTANCE_KEY] = true;

    // ── Registro global de posiciones + cálculo de offset ──
    if (!window.__CHATBOT_REGISTRY__) window.__CHATBOT_REGISTRY__ = {};

    var FAB_SIZE = 80;
    var FAB_GAP = 12;
    var FAB_BASE = 20;

    // Cuántas instancias ya ocupan esta misma posición
    var sameCount = Object.values(window.__CHATBOT_REGISTRY__)
        .filter(function (p) { return p === POSITION; }).length;

    // ── LÍMITES ──
    var MAX_TOTAL = 3;
    var MAX_PER_POSITION = 2;

    var totalCount = Object.keys(window.__CHATBOT_REGISTRY__).length;

    if (totalCount >= MAX_TOTAL) {
        console.warn("[chatbot] Límite total de " + MAX_TOTAL + " chatbots alcanzado. PID ignorado:", PID);
        return;
    }

    if (sameCount >= MAX_PER_POSITION) {
        console.warn("[chatbot] Límite de " + MAX_PER_POSITION + " chatbots en posición '" + POSITION + "'. PID ignorado:", PID);
        return;
    }

    window.__CHATBOT_REGISTRY__[PID] = POSITION;

    var STACK_OFFSET = FAB_BASE + (sameCount * (FAB_SIZE + FAB_GAP));

    var domain = window.location.hostname;
    if (window.location.port &&
        window.location.port !== "80" &&
        window.location.port !== "443") {
        domain += ":" + window.location.port;
    }

    /* ────────────────────────────────────────
       Helpers de posicionamiento del iframe
    ──────────────────────────────────────── */
    function getFabInitStyles() {
        if (POSITION === "bottom-left") {
            return "bottom:" + STACK_OFFSET + "px;left:20px";
        } else if (POSITION === "middle-right") {
            return "top:calc(50% - 40px);margin-top:" + (sameCount * (FAB_SIZE + FAB_GAP)) + "px;right:20px";
        } else {
            return "bottom:" + STACK_OFFSET + "px;right:20px";
        }
    }

    function applyClosedStyles(iframe, animated) {
        var POSITION_STYLES = {
            "bottom-left": { bottom: STACK_OFFSET + "px", left: "20px", right: "auto", top: "auto" },
            "middle-right": { top: "calc(50% - 40px)", right: "20px", bottom: "auto", left: "auto", marginTop: (sameCount * (FAB_SIZE + FAB_GAP)) + "px" },
            "bottom-right": { bottom: STACK_OFFSET + "px", right: "20px", left: "auto", top: "auto" }
        };

        var TRANSITION_PROPS = ["width", "height", "top", "right", "bottom", "left", "border-radius", "transform"];

        iframe.style.transition = animated
            ? TRANSITION_PROPS.map(function (p) { return p + " 0.24s cubic-bezier(0.4,0,1,1)"; }).join(",")
            : "none";

        Object.assign(iframe.style, {
            zIndex: "2147483647",
            width: "80px",
            height: "80px",
            borderRadius: "50%",
            overflow: "hidden",
            pointerEvents: "auto",
            transform: "scale(1)"
        });

        Object.assign(iframe.style, POSITION_STYLES[POSITION] || POSITION_STYLES["bottom-right"]);
    }

    function applyOpenStyles(iframe) {
        var w = Math.min(420, window.innerWidth - 40);
        var h = Math.min(680, window.innerHeight - 60);

        iframe.style.transition = "none";
        iframe.style.overflow = "visible";
        iframe.style.borderRadius = "16px";
        iframe.style.marginTop = "";

        requestAnimationFrame(function () {
            iframe.style.transition = ["width", "height", "top", "right", "bottom", "left"]
                .map(function (p) { return p + " 0.32s cubic-bezier(0.16,1,0.3,1)"; }).join(",");
            iframe.style.width = w + "px";
            iframe.style.height = h + "px";

            if (POSITION === "bottom-left") {
                iframe.style.bottom = "20px";
                iframe.style.left = "20px";
                iframe.style.right = "auto";
                iframe.style.top = "auto";
                iframe.style.transform = "scale(1)";
            } else if (POSITION === "middle-right") {
                iframe.style.top = "50%";
                iframe.style.right = "20px";
                iframe.style.bottom = "auto";
                iframe.style.left = "auto";
                iframe.style.transform = "translateY(-50%)";
            } else {
                iframe.style.bottom = "20px";
                iframe.style.right = "20px";
                iframe.style.left = "auto";
                iframe.style.top = "auto";
                iframe.style.transform = "scale(1)";
            }
        });
    }

    function applyMobileOpenStyles(iframe) {
        iframe.style.transition = "none";
        iframe.style.borderRadius = "0";
        iframe.style.overflow = "visible";
        iframe.style.width = "100%";
        iframe.style.left = "0";
        iframe.style.right = "auto";
        iframe.style.bottom = "auto";
        iframe.style.transform = "scale(1)";
        var targetH = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        var targetTop = window.visualViewport ? window.visualViewport.offsetTop : 0;
        iframe.style.height = targetH + "px";
        iframe.style.top = targetTop + "px";
    }

    function applyMobileClosingStyles(iframe) {
        iframe.style.transition = "none";
        iframe.style.width = "100%";
        iframe.style.left = "0";
        iframe.style.right = "auto";
        iframe.style.bottom = "auto";
        iframe.style.borderRadius = "0";
        iframe.style.overflow = "hidden";
        iframe.style.transform = "scale(1)";
        var hClose = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        var topClose = window.visualViewport ? window.visualViewport.offsetTop : 0;
        iframe.style.height = hClose + "px";
        iframe.style.top = topClose + "px";
    }

    /* ────────────────────────────────────────
       Welcome bubble
    ──────────────────────────────────────── */
    var welcomeEl = null;
    var pendingWelcome = null;
    var welcomeAutoDismissTimer = null;

    function createWelcome(message) {
        var el = document.createElement("div");
        var isLeft = POSITION === "bottom-left";
        var isMiddle = POSITION === "middle-right";
        var isMobile = window.innerWidth <= 480;

        // ── Posición horizontal ──
        // En mobile reservamos espacio para no solapar FABs de terceros (WhatsApp, etc.)
        // El ancho máximo también se limita para no cubrir el botón del lado opuesto
        var hPos, maxWidth;
        if (isMobile) {
            if (isLeft) {
                hPos = "left:14px;right:auto";
                maxWidth = "calc(100vw - 110px)"; // deja ~96px libre a la derecha para otros FABs
            } else {
                hPos = "right:14px;left:auto";
                maxWidth = "calc(100vw - 110px)"; // deja ~96px libre a la izquierda para el FAB propio
            }
        } else {
            hPos = isLeft ? "left:112px" : "right:112px";
            maxWidth = "260px";
        }

        // ── Posición vertical ──
        // En mobile subimos más la burbuja para no tapar el botón de WhatsApp u otros FABs
        var bottomOffset;
        if (isMobile) {
            // FAB_SIZE(80) + STACK_OFFSET(mín 20) + gap extra(16) = al menos 116px desde abajo
            bottomOffset = STACK_OFFSET + FAB_SIZE + 16;
        } else {
            bottomOffset = STACK_OFFSET + 14;
        }

        var vPos = isMiddle
            ? "top:50%;margin-top:" + (sameCount * (FAB_SIZE + FAB_GAP)) + "px"
            : "bottom:" + bottomOffset + "px";

        var transformInit = isMiddle
            ? (isLeft ? "transform:translateX(-10px) translateY(-50%) scale(0.97)"
                : "transform:translateX(10px) translateY(-50%) scale(0.97)")
            : (isLeft ? "transform:translateX(-10px) scale(0.97)"
                : "transform:translateX(10px) scale(0.97)");

        el.style.cssText = [
            "position:fixed", "z-index:2147483646", "max-width:" + maxWidth,
            "padding:14px 18px", "background:white", "color:" + SECONDARYCOLOR,
            "font-size:" + (isMobile ? "13px" : "14px"), "font-weight:600",
            "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
            "line-height:1.5", "border-radius:18px", "border:1.5px solid #e2e8f0",
            "box-shadow:0 4px 20px rgba(0,0,0,0.10),0 1px 4px rgba(0,0,0,0.06)",
            "opacity:0", "pointer-events:none", "cursor:default",
            "transition:opacity 0.35s ease,transform 0.35s ease",
            vPos, hPos, transformInit
        ].join(";");

        var arrow = document.createElement("div");
        arrow.style.cssText = [
            "position:absolute", "width:14px", "height:14px", "background:white",
            isLeft
                ? "left:-8px;top:50%;transform:translateY(-50%) rotate(45deg);border-left:1.5px solid #e2e8f0;border-bottom:1.5px solid #e2e8f0"
                : "right:-8px;top:50%;transform:translateY(-50%) rotate(45deg);border-right:1.5px solid #e2e8f0;border-top:1.5px solid #e2e8f0"
        ].join(";");

        el.appendChild(arrow);
        var text = document.createElement("span");
        text.textContent = message;
        el.appendChild(text);
        document.body.appendChild(el);
        return el;
    }

    function showWelcome(message) {
        if (welcomeEl) { welcomeEl.remove(); welcomeEl = null; }
        if (welcomeAutoDismissTimer) { clearTimeout(welcomeAutoDismissTimer); welcomeAutoDismissTimer = null; }

        welcomeEl = createWelcome(message);
        var isMobile = window.innerWidth <= 480;
        var isMiddle = POSITION === "middle-right";

        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                if (!welcomeEl) return;
                welcomeEl.style.opacity = "1";
                welcomeEl.style.transform = isMiddle
                    ? "translateX(0) translateY(-50%) scale(1)"
                    : "translateX(0) scale(1)";
            });
        });

        // En mobile auto-dismiss a los 4s para no bloquear contenido de terceros
        if (isMobile) {
            welcomeAutoDismissTimer = setTimeout(function () {
                hideWelcome();
            }, 4000);
        }
    }

    function hideWelcome() {
        if (welcomeAutoDismissTimer) { clearTimeout(welcomeAutoDismissTimer); welcomeAutoDismissTimer = null; }
        if (!welcomeEl) return;
        welcomeEl.style.opacity = "0";
        welcomeEl.style.pointerEvents = "none";
        var el = welcomeEl;
        welcomeEl = null;
        setTimeout(function () { if (el.parentNode) el.remove(); }, 400);
    }

    /* ────────────────────────────────────────
       Freeze / unfreeze + utilidades z-index
    ──────────────────────────────────────── */
    function sendFreezeUnfreeze(iframe, delay) {
        setTimeout(function () {
            try {
                iframe.contentWindow.postMessage({ type: "CHATBOT_FAB_FREEZE", instanceId: PID }, "*");
                setTimeout(function () {
                    iframe.contentWindow.postMessage({ type: "CHATBOT_FAB_UNFREEZE", instanceId: PID }, "*");
                }, 50);
            } catch (e) { }
        }, delay);
    }

    function restoreAllZIndex() {
        Object.keys(window.__CHATBOT_REGISTRY__).forEach(function (pid) {
            var f = document.getElementById("chatbot_" + pid);
            if (f) f.style.zIndex = "2147483647";
        });
    }

    /* ────────────────────────────────────────
       Estado + listener global (antes del XHR)
    ──────────────────────────────────────── */
    var _chatOpen = false;

    window.addEventListener("__CHATBOT_CLOSE_OTHERS__", function (evt) {
        if (evt.detail.pid === PID) return;

        hideWelcome();

        var selfIframe = document.getElementById("chatbot_" + PID);
        if (selfIframe) selfIframe.style.zIndex = "2147483640";

        if (!_chatOpen) return;
        _chatOpen = false;
        if (!selfIframe) return;

        if (window.innerWidth <= 480) {
            applyMobileClosingStyles(selfIframe);
            setTimeout(function () {
                applyClosedStyles(selfIframe, false);
                sendFreezeUnfreeze(selfIframe, 0);
            }, 320);
        } else {
            applyClosedStyles(selfIframe, true);
            sendFreezeUnfreeze(selfIframe, 260);
        }

        try {
            selfIframe.contentWindow.postMessage({ type: "CHATBOT_FORCE_CLOSE", instanceId: PID }, "*");
        } catch (e) { }
    });

    /* ────────────────────────────────────────
       Challenge → mount iframe
    ──────────────────────────────────────── */
    var xhr = new XMLHttpRequest();
    var _retries = 0;
    var MAX_RETRIES = 2;
    var _observer = null;

    function doChallenge() {
        if (_observer) {
            _observer.disconnect();
            _observer = null;
        }
        xhr = new XMLHttpRequest();
        xhr.open("GET", BASE + "/api/chatbot-integration/" + PID + "/challenge?d=" + encodeURIComponent(domain), true);
        xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) return;
            if (xhr.status !== 200) {
                console.warn("[chatbot] dominio no autorizado:", domain);
                return;
            }
            var data;
            try { data = JSON.parse(xhr.responseText); } catch (e) { return; }
            if (!data.challenge) return;
            mountIframe(data.challenge);
        };
        xhr.send();
    }

    doChallenge();

    /* ────────────────────────────────────────
       Mount iframe
    ──────────────────────────────────────── */
    function mountIframe(challenge) {
        var iframe = document.createElement("iframe");
        iframe.id = "chatbot_" + PID;
        iframe.src = BASE + "/api/chatbot-integration/embed/" + PID
            + "?d=" + encodeURIComponent(domain)
            + "&c=" + encodeURIComponent(challenge);

        iframe.style.cssText = [
            "position:fixed", getFabInitStyles(),
            "width:80px", "height:80px", "border:none",
            "z-index:2147483647", "background:transparent",
            "pointer-events:auto", "overflow:hidden", "border-radius:50%",
            "transform:scale(0)",
            "transition:border-radius 0.32s cubic-bezier(0.16,1,0.3,1),opacity 0.22s ease"
        ].join(";");

        iframe.sandbox = "allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation";
        iframe.setAttribute("allow", "clipboard-write");

        var iframeLoaded = false;
        iframe.addEventListener("load", function () {
            iframeLoaded = true;
            var delay = sameCount * 150;
            setTimeout(function () {
                iframe.style.transition = [
                    "transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
                    "border-radius 0.32s cubic-bezier(0.16,1,0.3,1)",
                    "opacity 0.22s ease"
                ].join(",");
                iframe.style.transform = "scale(1)";
            }, delay);

            if (pendingWelcome) {
                var msg = pendingWelcome;
                pendingWelcome = null;
                setTimeout(function () { showWelcome(msg); }, 300 + delay);
            }
        });

        document.body.appendChild(iframe);

        /* ── Viewport fixes (mobile) ── */
        function applyViewportFix() {
            if (!_chatOpen || window.innerWidth > 480 || !window.visualViewport) return;
            iframe.style.height = window.visualViewport.height + "px";
            iframe.style.top = window.visualViewport.offsetTop + "px";
            iframe.style.bottom = "auto";
            iframe.style.left = "0";
            iframe.style.right = "auto";
            iframe.style.width = "100%";
        }

        function resetViewportFix() {
            iframe.style.height = "80px";
            iframe.style.width = "80px";
            iframe.style.top = "";
        }

        function notifyScrollToBottom() {
            if (!_chatOpen) return;
            try { iframe.contentWindow.postMessage({ type: "CHATBOT_SCROLL_BOTTOM", instanceId: PID }, "*"); }
            catch (e) { }
        }

        if (window.visualViewport) {
            window.visualViewport.addEventListener("resize", applyViewportFix);
            window.visualViewport.addEventListener("scroll", applyViewportFix);
            window.visualViewport.addEventListener("resize", notifyScrollToBottom);
        }
        window.addEventListener("resize", function () { if (_chatOpen) notifyScrollToBottom(); });

        var _inputFocused = false;
        window.addEventListener("focusin", function (e) {
            var t = e.target && e.target.tagName;
            if (t === "INPUT" || t === "TEXTAREA") _inputFocused = true;
        });
        window.addEventListener("focusout", function () {
            if (!_inputFocused) return;
            _inputFocused = false;
            setTimeout(function () {
                if (_chatOpen) applyViewportFix(); else resetViewportFix();
            }, 100);
        });

        /* ── Message handler ── */
        var _welcomeShownThisLoad = false;

        window.addEventListener("message", function (e) {
            if (e.data && e.data.type === "CHATBOT_CHALLENGE_EXPIRED") {
                if (e.data.instanceId && e.data.instanceId !== PID) return;
                var old = document.getElementById("chatbot_" + PID);
                if (old) old.remove();
                if (_retries < MAX_RETRIES) {
                    _retries++;
                    setTimeout(doChallenge, 500);
                }
                return;
            }
            if (!e.data || !e.data.type) return;
            if (e.data.instanceId && e.data.instanceId !== PID) return;

            switch (e.data.type) {

                case "CHATBOT_FAB_FREEZE":
                    document.querySelector(".chat-fab")?.classList.add("no-transition");
                    break;

                case "CHATBOT_FAB_UNFREEZE":
                    document.querySelector(".chat-fab")?.classList.remove("no-transition");
                    break;

                case "CHATBOT_WELCOME":
                    if (e.data.visible && e.data.message) {
                        if (!iframeLoaded) pendingWelcome = e.data.message;
                        else showWelcome(e.data.message);
                    } else {
                        hideWelcome();
                    }
                    break;

                case "CHATBOT_WELCOME_REQUEST":
                    iframe.contentWindow.postMessage({
                        type: "CHATBOT_WELCOME_PERMISSION",
                        instanceId: PID,
                        allowed: !_welcomeShownThisLoad
                    }, "*");
                    if (!_welcomeShownThisLoad) _welcomeShownThisLoad = true;
                    break;

                case "CHATBOT_WELCOME_SEEN":
                    _welcomeShownThisLoad = true;
                    break;

                case "CHATBOT_RESIZE":
                    if (e.data.open) {
                        _chatOpen = true;
                        hideWelcome();
                        iframe.style.zIndex = "2147483647";

                        window.dispatchEvent(new CustomEvent("__CHATBOT_CLOSE_OTHERS__", {
                            detail: { pid: PID }
                        }));

                        if (window.innerWidth <= 480) {
                            applyMobileOpenStyles(iframe);
                        } else {
                            applyOpenStyles(iframe);
                        }

                    } else {
                        _chatOpen = false;

                        requestAnimationFrame(function () {
                            if (window.innerWidth <= 480) {
                                applyMobileClosingStyles(iframe);
                                setTimeout(function () {
                                    applyClosedStyles(iframe, false);
                                    sendFreezeUnfreeze(iframe, 0);
                                    restoreAllZIndex();
                                }, 320);
                            } else {
                                applyClosedStyles(iframe, true);
                                sendFreezeUnfreeze(iframe, 260);
                                restoreAllZIndex();
                            }
                        });
                    }
                    break;
            }
        });

        /* ── Observer: evitar que el iframe sea removido del DOM ── */
        _observer = new MutationObserver(function () {
            if (!document.getElementById("chatbot_" + PID)) document.body.appendChild(iframe);
            if (welcomeEl && !document.body.contains(welcomeEl)) document.body.appendChild(welcomeEl);
        });
        _observer.observe(document.body, { childList: true });

    } /* ── fin mountIframe ── */
})();