const resend = require("./mailer.service");

exports.sendResetPasswordEmail = async (user, code) => {
  const year = new Date().getFullYear();

  const { data, error } = await resend.emails.send({
    from:    "Soporte Chatbot <onboarding@resend.dev>",
    to:      user.email,
    subject: "Código de recuperación",
    html: `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#F2F2F2;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:30px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
             style="background:#fff;border-radius:14px;overflow:hidden;">

        <!-- HEADER -->
        <tr>
          <td style="background:#034AA6;padding:22px 28px;text-align:center;">
            <h2 style="margin:0;color:#fff;font-size:19px;font-weight:700;">
              Recuperación de contraseña
            </h2>
            <p style="margin:5px 0 0;color:#04C4D9;font-size:12px;text-transform:uppercase;letter-spacing:1px;">
              Código de verificación
            </p>
          </td>
        </tr>

        <!-- CONTENT -->
        <tr>
          <td style="padding:28px 32px;color:#374151;font-size:15px;line-height:1.6;">
            <p style="margin:0 0 12px;">
              Hola <strong>${user.name}</strong>,
            </p>
            <p style="margin:0 0 24px;">
              Recibimos una solicitud para restablecer tu contraseña.
              Usa el siguiente código para continuar:
            </p>

            <!-- CODE -->
            <div style="text-align:center;margin:24px 0;">
              <span style="
                display:inline-block;
                background:#111827;
                color:#ffffff;
                padding:14px 32px;
                font-size:28px;
                letter-spacing:6px;
                border-radius:8px;
                font-weight:bold;
              ">${code}</span>
            </div>

            <p style="margin:16px 0 8px;">
              ⏱️ <strong>Este código expira en 10 minutos.</strong>
            </p>
            <p style="margin:0;color:#6b7280;font-size:13px;">
              Si no solicitaste este cambio, puedes ignorar este mensaje con seguridad.
            </p>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#28403D;padding:14px;text-align:center;">
            <p style="margin:0;font-size:11px;color:#04C4D9;">
              © ${year} Chatbot · Soporte técnico
            </p>
            <p style="margin:4px 0 0;font-size:11px;color:#9ca3af;">
              Este es un correo automático, por favor no respondas.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
  });

  if (error) {
    console.error("❌ Error Resend (reset password):", error);
    throw error;
  }

  return data;
};