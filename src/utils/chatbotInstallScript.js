// utils/chatbotInstallScript.js
module.exports = function getChatbotInstallScript({ domain, publicId, installToken }) {
  const normalizedDomain = domain.replace(/^www\./, "").toLowerCase();

  const baseUrl =
    process.env.NODE_ENV === "development"
      ? "http://localhost:3000"
      : "https://app.tudominio.com";

  return `<!-- Chatbot Script - ${normalizedDomain} -->
<script>
(function(w, d) {
  // Prevenir instalación duplicada
  if (w.__CHATBOT_INSTALLED__) return;
  w.__CHATBOT_INSTALLED__ = true;
  // Generar timestamp actual (ventana de 1 minuto)
  var timeWindow = Math.floor(Date.now() / 60000);  
  var script = d.createElement("script");
  script.src = "${baseUrl}/api/chatbot-integration/chatbot/${publicId}.js?d=${normalizedDomain}&t=${installToken}&w=" + timeWindow;
  script.async = true;
  script.onerror = function() {
    console.warn("[Chatbot] Error al cargar el script");
  };
  d.head.appendChild(script);
})(window, document);
</script>`;
};