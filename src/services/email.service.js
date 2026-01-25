const transporter = require("./mailer.service");

exports.sendResetPasswordEmail = async (user, code) => {
  return transporter.sendMail({
    from: `"Soporte Chatbot" <${process.env.SMTP_USER}>`,
    to: user.email,
    subject: "Código de recuperación",
    html: `<!-- Header --> <tr> 
    <td style="text-align:center; padding-bottom:16px;"> 
    <h2 style="margin:0; color:#1f2937;">Recuperación de contraseña</h2> 
    </td> </tr> <!-- Content --> <tr> 
    <td style="color:#374151; font-size:15px; line-height:1.6;"> 
    <p>Hola <strong>${user.name}</strong>,
    </p> <p>Recibimos una solicitud para restablecer tu contraseña. Usa el siguiente código para continuar:
    </p> <!-- Code --> <div style="text-align:center; margin:24px 0;"> 
    <span style=" display:inline-block; background:#111827; color:#ffffff; padding:14px 24px; font-size:22px; letter-spacing:4px; border-radius:6px; font-weight:bold; "> 
    ${code} 
    </span> 
    </div> <p style="margin-top:16px;"> ⏱️ <strong>Este código expira en 10 minutos.</strong> 
    </p> 
    <p> Si no solicitaste este cambio, puedes ignorar este mensaje con seguridad. </p> </td> </tr> <!-- Footer --> <tr> <td style="border-top:1px solid #e5e7eb; margin-top:24px; padding-top:16px; font-size:13px; color:#6b7280; text-align:center;"> <p style="margin:0;"> © {{AÑO}} Chatbot · Soporte técnico </p> <p style="margin:4px 0 0;"> Este es un correo automático, por favor no respondas. </p> </td> </tr> </table> </td> </tr>`
  });
};


//chatbot_proyect2026
//wulg zuxy wkfv ipyd