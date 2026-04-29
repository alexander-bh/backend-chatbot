const ConversationSession = require("../models/ConversationSession");
const upsertContactFromSession = require("../services/upsertContactFromSession.service");
const { sendConversationEmail } = require("../services/chatbotEmail.service");
const Notification = require("../models/Notification");
const { sendToAccount } = require("../services/pusher.service");
const formatDateAMPM = require("../utils/formatDate");

exports.finalizeConversation = async (session) => {
  // ── 1. Upsert contacto + marcar sesión completada en paralelo ──
  const [contact] = await Promise.all([
    upsertContactFromSession(session),
    ConversationSession.findByIdAndUpdate(session._id, {
      is_completed: true,
      status: "completed",
    }),
  ]);

  // ── 2. Persistir contact_id en sesión si se creó contacto ──
  if (contact) {
    await ConversationSession.findByIdAndUpdate(session._id, {
      contact_id: contact._id,
    });

    const nombre = [contact.name, contact.last_name].filter(Boolean).join(" ") || "Sin nombre";

    // ── 3. Notificaciones en background (no bloquean) ──
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

      sendToAccount(session.account_id, "contact-created", {
        _id: contact._id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        source: contact.source || "chatbot",
        status: contact.status,
        createdAt: contact.createdAt,
        createdAtFormatted: contact.createdAt ? formatDateAMPM(contact.createdAt) : null,
      }),
    ]).catch((err) =>
      console.error("❌ Error en notificaciones post-contacto:", {
        session_id: session._id,
        contact_id: contact._id,
        message: err.message,
      })
    );
  }

  if (contact) {
    sendConversationEmail(session, contact).catch((err) =>
      console.error("❌ Error en sendConversationEmail:", {
        session_id: session._id,
        message: err.message,
        code: err.code,
      })
    );
  } else {
    console.log(`ℹ️ [finalize] Sin contacto identificable — se omite email. session: ${session._id}`);
  }

  return contact;
};