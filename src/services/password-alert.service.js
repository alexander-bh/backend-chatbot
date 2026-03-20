const resend = require("./mailer.service");

exports.sendPasswordChangedAlert = async (user, meta = {}) => {
  const { data, error } = await resend.emails.send({
    from:    "Soporte Chatbot <onboarding@resend.dev>",
    to:      user.email,
    subject: "Tu contraseña ha sido modificada",
    html: `
      <h2>🔐 Cambio de contraseña</h2>
      <p>Hola <strong>${user.name}</strong>,</p>
      <p>Te informamos que tu contraseña fue <strong>modificada correctamente</strong>.</p>
      <ul>
        <li><strong>Fecha:</strong> ${new Date().toLocaleString()}</li>
        ${meta.ip     ? `<li><strong>IP:</strong> ${meta.ip}</li>`             : ""}
        ${meta.device ? `<li><strong>Dispositivo:</strong> ${meta.device}</li>` : ""}
      </ul>
      <p>Si tú realizaste este cambio, no necesitas hacer nada más.</p>
      <p style="color:#b91c1c;">
        ⚠️ Si NO reconoces esta acción, cambia tu contraseña inmediatamente y contacta a soporte.
      </p>
      <hr />
      <p style="font-size:13px;color:#6b7280;">Este es un correo automático, por favor no respondas.</p>
    `
  });

  if (error) {
    console.error("❌ Error Resend (password alert):", error);
    throw error;
  }

  return data;
};