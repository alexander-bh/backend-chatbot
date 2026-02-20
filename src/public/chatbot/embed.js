(function () {
  "use strict";

  // 🔒 Evita múltiples cargas del widget
  if (window.__CHATBOT_WIDGET_LOADED__) return;
  window.__CHATBOT_WIDGET_LOADED__ = true;

  const scriptTag = document.currentScript;
  if (!scriptTag) {
    console.error("[Chatbot] No se pudo detectar el script actual.");
    return;
  }

  const configAttr = scriptTag.getAttribute("data-config");
  if (!configAttr) {
    console.error("[Chatbot] Falta data-config.");
    return;
  }

  let config;
  try {
    config = JSON.parse(configAttr);
  } catch (err) {
    console.error("[Chatbot] JSON inválido en data-config.");
    return;
  }

  const { chatbotId, apiBase } = config;

  // 🔒 Validación básica del apiBase
  if (!apiBase || typeof apiBase !== "string" || !apiBase.startsWith("http")) {
    console.error("[Chatbot] apiBase inválido.");
    return;
  }

  if (!chatbotId) {
    console.error("[Chatbot] chatbotId faltante.");
    return;
  }

  // ===============================
  // 🔐 Utilidad: fetch con timeout
  // ===============================
  function fetchWithTimeout(resource, options = {}, timeout = 15000) {
    return Promise.race([
      fetch(resource, options),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Request timeout")), timeout)
      )
    ]);
  }

  // ===============================
  // 📦 Estado
  // ===============================
  let sessionId = localStorage.getItem("chatbot_session_id");
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem("chatbot_session_id", sessionId);
  }

  let currentNodeId = null;
  let isTyping = false;

  // ===============================
  // 🧱 Crear UI
  // ===============================
  const container = document.createElement("div");
  container.id = "chatbot-widget";
  container.innerHTML = `
    <div id="chatbot-button">💬</div>
    <div id="chatbot-window" style="display:none;">
      <div id="chatbot-messages"></div>
      <div id="chatbot-input-area">
        <input type="text" id="chatbot-input" placeholder="Escribe tu mensaje..." />
        <button id="chatbot-send">Enviar</button>
      </div>
    </div>
  `;
  document.body.appendChild(container);

  const button = document.getElementById("chatbot-button");
  const windowEl = document.getElementById("chatbot-window");
  const messagesEl = document.getElementById("chatbot-messages");
  const inputEl = document.getElementById("chatbot-input");
  const sendBtn = document.getElementById("chatbot-send");

  button.addEventListener("click", () => {
    windowEl.style.display =
      windowEl.style.display === "none" ? "block" : "none";
  });

  sendBtn.addEventListener("click", sendMessage);
  inputEl.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
  });

  // ===============================
  // 📨 Enviar mensaje
  // ===============================
  async function sendMessage() {
    const message = inputEl.value.trim();
    if (!message || isTyping) return;

    appendMessage("user", message);
    inputEl.value = "";

    try {
      isTyping = true;

      const res = await fetchWithTimeout(
        `${apiBase}/chatbot/${chatbotId}/message`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            message,
            session_id: sessionId,
            current_node_id: currentNodeId
          })
        }
      );

      if (!res.ok) {
        throw new Error("Error en respuesta del servidor");
      }

      const data = await res.json();
      await processNode(data);

    } catch (err) {
      console.error("[Chatbot] Error enviando mensaje:", err);
      appendMessage("bot", "⚠️ Ocurrió un error. Intenta nuevamente.");
    } finally {
      isTyping = false;
    }
  }

  // ===============================
  // 🔁 Procesar nodo
  // ===============================
  async function processNode(data, depth = 0) {
    if (!data || depth > 20) return;

    if (data.message) {
      appendMessage("bot", data.message);
    }

    if (data.link_action) {
      window.open(data.link_action, "_blank", "noopener,noreferrer");
    }

    currentNodeId = data.node_id || null;

    if (data.next) {
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

        if (!res.ok) {
          throw new Error("Error en next");
        }

        const nextData = await res.json();
        return processNode(nextData, depth + 1);

      } catch (err) {
        console.error("[Chatbot] Error en next:", err);
      }
    }
  }

  // ===============================
  // 💬 Agregar mensaje a UI
  // ===============================
  function appendMessage(type, text) {
    const msg = document.createElement("div");
    msg.className = `chatbot-message ${type}`;
    msg.textContent = text;
    messagesEl.appendChild(msg);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  console.log("[Chatbot] Widget cargado correctamente.");
})();
