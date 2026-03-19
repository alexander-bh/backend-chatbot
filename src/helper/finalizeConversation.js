const upsertContactFromSession  = require("../services/upsertContactFromSession.service");
const { sendConversationEmail } = require("../services/chatbotEmail.service");
const Chatbot                   = require("../models/Chatbot");
const Notification              = require("../models/Notification"); // ← nuevo import

exports.finalizeConversation = async (session) => {

  session.is_completed = true;
  session.status = "completed";

  /* ================= CREAR / ACTUALIZAR CONTACTO ================= */

  const contact = await upsertContactFromSession(session);

  if (contact) {
    session.contact_id = contact._id;

    /* ================= NOTIFICACIÓN EN PÁGINA ================= */
    try {
      const nombre = [
        contact.name,
        contact.last_name
      ].filter(Boolean).join(" ") || "Sin nombre";

      await Notification.create({
        account_id: session.account_id,
        type:       "new_contact",
        title:      "Nuevo contacto registrado",
        message:    `${nombre} se registró a través del chatbot.`,
        data: {
          contact_id: contact._id,
          name:       nombre,
          email:      contact.email  || null,
          phone:      contact.phone  || null,
          origin_url: session.origin_url || null,
        },
        is_read: false
      });
    } catch (notifErr) {
      console.error("Error creando notificación de nuevo contacto:", notifErr);
    }
  }

  /* ================= GUARDAR SESIÓN ================= */

  await session.save();

  /* ================= VERIFICAR EMAIL SETTINGS ================= */

  const chatbot = await Chatbot
    .findById(session.chatbot_id)
    .select("email_settings");

  const emailSettings = chatbot?.email_settings || {};

  const canSendEmail =
    emailSettings.enabled    === true &&
    emailSettings.to_email   &&
    emailSettings.from_email;

  /* ================= ENVIAR EMAIL SOLO SI ESTÁ HABILITADO ================= */

  if (canSendEmail) {
    await sendConversationEmail(session);
  }

  return contact;
};