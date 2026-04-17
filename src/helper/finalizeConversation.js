const upsertContactFromSession = require("../services/upsertContactFromSession.service");
const { sendConversationEmail } = require("../services/chatbotEmail.service");
const Notification = require("../models/Notification");
const { sendToAccount } = require("../services/pusher.service");
const formatDateAMPM = require("../utils/formatDate");

exports.finalizeConversation = async (session) => {
  session.is_completed = true;
  session.status = "completed";

  // ✅ Paralelizar: contacto + guardado de sesión al mismo tiempo
  const [contact] = await Promise.all([
    upsertContactFromSession(session),
    session.save(),
  ]);

  if (contact) {
    session.contact_id = contact._id;

    const nombre = [contact.name, contact.last_name].filter(Boolean).join(" ") || "Sin nombre";

    // ✅ Notificación + Pusher contacto en paralelo, sin bloquear el flujo
    Promise.all([
      Notification.create({
        account_id: session.account_id,
        type: "new_contact",
        title: "Nuevo contacto registrado",
        message: `${nombre} se registró a través del chatbot.`,
        data: {
          contact_id: contact._id,
          name: nombre,
          email: contact.email || null,
          phone: contact.phone || null,
          origin_url: session.origin_url || null,
        },
        is_read: false,
      }).then((notif) =>
        sendToAccount(session.account_id, "new-notification", { notification: notif })
      ),

      Promise.resolve(
        sendToAccount(session.account_id, "contact-created", {
          _id: contact._id,
          name: contact.name,
          email: contact.email,
          phone: contact.phone,
          source: contact.source || "chatbot",
          status: contact.status,
          createdAt: contact.createdAt,
          createdAtFormatted: contact.createdAt ? formatDateAMPM(contact.createdAt) : null,
        })
      ),
    ]).catch((err) => console.error("❌ Error en notificaciones post-contacto:", err));
  }

  // ✅ Fire-and-forget: no bloquea el return
  sendConversationEmail(session).catch(console.error);

  return contact;
};