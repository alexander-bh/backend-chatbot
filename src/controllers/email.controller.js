const { BrevoClient } = require("@getbrevo/brevo");

const client = new BrevoClient({ apiKey: process.env.BREVO_API_KEY });

const sendTestEmail = async (req, res) => {
  const { to, subject, message } = req.body;

  if (!to || !subject || !message) {
    return res.status(400).json({
      success: false,
      error: "Los campos 'to', 'subject' y 'message' son obligatorios.",
    });
  }

  try {
    const result = await client.transactionalEmails.sendTransacEmail({
      sender: { name: "ChatbotAnfeta", email: "info@weblab.com.mx" },
      to: [{ email: to }],
      subject,
      textContent: message,
      htmlContent: `
        <div style="font-family: sans-serif; padding: 24px; max-width: 600px; margin: auto; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h2 style="color: #1f2937;">📧 Correo de Prueba</h2>
          <p style="color: #374151; font-size: 16px;">${message}</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #9ca3af; font-size: 12px;">Este es un correo de prueba enviado automáticamente.</p>
        </div>
      `,
    });

    return res.status(200).json({
      success: true,
      message: "Correo enviado correctamente.",
      messageId: result?.messageId,
    });
  } catch (err) {
    console.error("Error al enviar correo:", err);
    return res.status(500).json({
      success: false,
      error: "No se pudo enviar el correo. Verifica la configuración de Brevo.",
      detail: err.message,
    });
  }
};

module.exports = { sendTestEmail };