exports.sendResetPasswordEmail = (user, resetLink) => {
  return {
    to: user.email,
    subject: "Recuperar contraseña",
    text: `
Hola ${user.name},

Recibimos una solicitud para restablecer tu contraseña.

Haz clic aquí:
${resetLink}

Este enlace expira en 30 minutos.

Si no fuiste tú, ignora este mensaje.
`
  };
};
