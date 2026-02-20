(function () {
  "use strict";

  // Evita doble carga
  if (window.__CHATBOT_WIDGET_LOADED__) return;
  window.__CHATBOT_WIDGET_LOADED__ = true;

  const script = document.currentScript;
  if (!script) return;

  const configRaw = script.getAttribute("data-config");
  if (!configRaw) {
    console.error("[Chatbot] data-config faltante");
    return;
  }

  let config;
  try {
    config = JSON.parse(configRaw);
  } catch {
    console.error("[Chatbot] data-config inválido");
    return;
  }

  const { chatbotId, apiBase } = config;
  if (!chatbotId || !apiBase) {
    console.error("[Chatbot] Config incompleta");
    return;
  }

  // ===============================
  // DOM
  // ===============================
  const chatWidget = document.getElementById("chatWidget");
  const chatToggle = document.getElementById("chatToggle");
  const chatClose = document.getElementById("chatClose");
  const messages = document.getElementById("messages");
  const input = document.getElementById("messageInput");
  const sendBtn = document.getElementById("sendBtn");
  const restartBtn = document.getElementById("chatRestart");

  if (!chatWidget || !chatToggle) {
    console.error("[Chatbot] DOM incompleto");
    return;
  }

  // ===============================
  // Estado
  // ===============================
  let sessionId = localStorage.getItem("chatbot_session_id");
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem("chatbot_session_id", sessionId);
  }

  let currentNodeId = null;
  let isTyping = false;

  // ===============================
  // UI Helpers
  // ===============================
  function openChat() {
    chatWidget.classList.add("open");
    chatToggle.classList.add("active");
    input.focus();
  }

  function closeChat() {
    chatWidget.classList.remove("open");
    chatToggle.classList.remove("active");
  }

  function scrollBottom() {
    messages.scrollTop = messages.scrollHeight;
  }

  function createMessage(type, text) {
    const msg = document.createElement("div");
    msg.className = `msg ${type}`;

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = text;

    msg.appendChild(bubble);
    messages.appendChild(msg);
    scrollBottom();
  }

  function showTyping() {
    if (isTyping) return;
    isTyping = true;

    const msg = document.createElement("div");
    msg.className = "msg bot typing";
    msg.id = "typingIndicator";

    const bubble = document.createElement("div");
    bubble.className = "bubble";

    bubble.innerHTML = `
      <div class="typing-dots">
        <span></span><span></span><span></span>
      </div>
    `;

    msg.appendChild(bubble);
    messages.appendChild(msg);
    scrollBottom();
  }

  function hideTyping() {
    isTyping = false;
    const typing = document.getElementById("typingIndicator");
    if (typing) typing.remove();
  }

  // ===============================
  // Fetch con timeout
  // ===============================
  function fetchWithTimeout(url, options = {}, timeout = 15000) {
    return Promise.race([
      fetch(url, options),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), timeout)
      )
    ]);
  }

  // ===============================
  // Enviar mensaje
  // ===============================
  async function sendMessage() {
    const text = input.value.trim();
    if (!text || isTyping) return;

    createMessage("user", text);
    input.value = "";

    showTyping();

    try {
      const res = await fetchWithTimeout(
        `${apiBase}/chatbot/${chatbotId}/message`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            session_id: sessionId,
            current_node_id: currentNodeId
          })
        }
      );

      if (!res.ok) throw new Error("Respuesta inválida");

      const data = await res.json();
      hideTyping();
      await processNode(data);

    } catch (err) {
      hideTyping();
      console.error(err);
      createMessage("bot error", "⚠️ Error de conexión. Intenta de nuevo.");
    }
  }

  // ===============================
  // Procesar flujo
  // ===============================
  async function processNode(data, depth = 0) {
    if (!data || depth > 20) return;

    if (data.message) {
      createMessage("bot", data.message);
    }

    if (data.link_action) {
      window.open(data.link_action, "_blank", "noopener,noreferrer");
    }

    currentNodeId = data.node_id || null;

    if (data.next) {
      showTyping();
      try {
        const res = await fetchWithTimeout(
          `${apiBase}/chatbot/${chatbotId}/next`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              session_id: sessionId,
              current_node_id: data.next
            })
          }
        );

        if (!res.ok) throw new Error("Error next");

        const nextData = await res.json();
        hideTyping();
        return processNode(nextData, depth + 1);

      } catch {
        hideTyping();
      }
    }
  }

  // ===============================
  // Eventos
  // ===============================
  chatToggle.addEventListener("click", openChat);
  chatClose.addEventListener("click", closeChat);

  sendBtn.addEventListener("click", sendMessage);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
  });

  restartBtn.addEventListener("click", () => {
    messages.innerHTML = "";
    currentNodeId = null;
    sessionId = crypto.randomUUID();
    localStorage.setItem("chatbot_session_id", sessionId);
  });

  console.log("[Chatbot] Widget listo ✅");
})();