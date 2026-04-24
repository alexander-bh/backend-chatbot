const transporter = require("../services/mailer.service");

const sendTestEmail = async (req, res) => {
  const { to, subject, message } = req.body;
  if (!to || !subject || !message) {
    return res.status(400).json({
      success: false,
      error: "Los campos 'to', 'subject' y 'message' son obligatorios.",
    });
  }
  const mailOptions = {
    from: `"Prueba de Correo" <${process.env.SMTP_USER}>`,
    to,
    subject,
    text: message,
    html: `
      <div style="font-family: sans-serif; padding: 24px; max-width: 600px; margin: auto; border: 1px solid #e5e7eb; border-radius: 8px;">
        <h2 style="color: #1f2937;">📧 Correo de Prueba</h2>
        <p style="color: #374151; font-size: 16px;">${message}</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #9ca3af; font-size: 12px;">Este es un correo de prueba enviado automáticamente.</p>
      </div>
    `,
  };
  try {
    const info = await transporter.sendMail(mailOptions);
    return res.status(200).json({
      success: true,
      message: "Correo enviado correctamente.",
      messageId: info.messageId,
    });
  } catch (err) {
    console.error("Error al enviar correo:", err);
    return res.status(500).json({
      success: false,
      error: "No se pudo enviar el correo. Verifica la configuración SMTP.",
      detail: err.message,
    });
  }
};

module.exports = { sendTestEmail };