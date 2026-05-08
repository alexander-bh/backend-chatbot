const { BrevoClient } = require("@getbrevo/brevo");

const client = new BrevoClient({ apiKey: process.env.BREVO_API_KEY });

exports.sendPasswordChangedAlert = async (user, meta = {}) => {
  return client.transactionalEmails.sendTransacEmail({
    sender: { name: "Soporte Chatbot",  email: "info@weblab.com.mx" },
      to: [{ email: to }],
    to: [{ email: user.email }],
    subject: "Tu contraseña ha sido modificada",
    htmlContent: `
      <h2>🔐 Cambio de contraseña</h2>
      <p>Hola <strong>${user.name}</strong>,</p>

      <p>Te informamos que tu contraseña fue <strong>modificada correctamente</strong>.</p>

      <ul>
        <li><strong>Fecha:</strong> ${new Date().toLocaleString()}</li>
        ${meta.ip ? `<li><strong>IP:</strong> ${meta.ip}</li>` : ""}
        ${meta.device ? `<li><strong>Dispositivo:</strong> ${meta.device}</li>` : ""}
      </ul>

      <p>
        Si tú realizaste este cambio, no necesitas hacer nada más.
      </p>

      <p style="color:#b91c1c;">
        ⚠️ Si NO reconoces esta acción, cambia tu contraseña inmediatamente
        y contacta a soporte.
      </p>

      <hr />
      <p style="font-size:13px;color:#6b7280;">
        Este es un correo automático, por favor no respondas.
      </p>
    `,
  });
};