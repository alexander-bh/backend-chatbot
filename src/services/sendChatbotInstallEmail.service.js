const transporter = require("./mailer.service");
const getChatbotInstallScript = require("../utils/chatbotInstallScript");

module.exports = async function sendChatbotInstallEmail({
  to,
  chatbotName,
  publicId
}) {
  const script = getChatbotInstallScript(publicId);

  const html = `
    <h2>Instalación del chatbot "${chatbotName}"</h2>

    <p>
      Copia el siguiente código y pégalo en tu sitio web,
      justo antes de la etiqueta <strong>&lt;/head&gt;</strong>.
    </p>

    <pre style="background:#111;color:#0f0;padding:12px;border-radius:6px;">
${script.replace(/</g, "&lt;").replace(/>/g, "&gt;")}
    </pre>
    <p>
      Este código debe insertarse en todas las páginas donde deseas que
      se muestre el chatbot.
    </p>
  `;

  await transporter.sendMail({
    from: `"Chatbot Platform" <${process.env.SMTP_USER}>`,
    to,
    subject: `Código de instalación del chatbot ${chatbotName}`,
    html
  });
};
