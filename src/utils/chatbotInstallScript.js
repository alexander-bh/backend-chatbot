// utils/chatbotInstallScript.js
module.exports = function getChatbotInstallScript({
  domain,
  publicId,
  installToken
}) {
  const normalizedDomain = domain
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "")
    .toLowerCase();

  const baseUrl =
    process.env.NODE_ENV === "development"
      ? "http://localhost:3000"
      : "https://backend-chatbot-omega.vercel.app";

  return `
<script>
(function () {
  if (window.__CHATBOT_${publicId}__) return;
  window.__CHATBOT_${publicId}__ = true;

  var script = document.createElement("script");
  script.src = "${baseUrl}/api/chatbot-integration/chatbot/${publicId}.js";
  script.async = true;
  script.defer = true;
  script.setAttribute("data-domain", "${normalizedDomain}");
  script.setAttribute("data-token", "${installToken}");

  script.onerror = function () {
    console.warn("[Chatbot] Error al cargar el script");
  };

  document.head.appendChild(script);
})();
</script>`;
};
