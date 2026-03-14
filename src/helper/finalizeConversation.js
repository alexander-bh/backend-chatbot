const upsertContactFromSession = require("../services/upsertContactFromSession.service");
const { sendConversationEmail } = require("../services/chatbotEmail.service");
const Chatbot = require("../models/Chatbot");

exports.finalizeConversation = async (session) => {

  session.is_completed = true;
  session.status = "completed";

  /* ================= CREAR / ACTUALIZAR CONTACTO ================= */

  const contact = await upsertContactFromSession(session);

  if (contact) {
    session.contact_id = contact._id;
  }

  /* ================= GUARDAR SESIÓN ================= */

  await session.save();

  /* ================= VERIFICAR EMAIL SETTINGS ================= */

  const chatbot = await Chatbot
    .findById(session.chatbot_id)
    .select("email_settings");

  const emailSettings = chatbot?.email_settings || {};

  const canSendEmail =
    emailSettings.enabled === true &&
    emailSettings.to_email &&
    emailSettings.from_email;

  /* ================= ENVIAR EMAIL SOLO SI ESTÁ HABILITADO ================= */

  if (canSendEmail) {
    await sendConversationEmail(session);
  }

  return contact;
};