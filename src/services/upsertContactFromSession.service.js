const Contact = require("../models/Contact");
const calculateLeadScore = require("../services/leadScore.service");
const ConversationSession = require("../models/ConversationSession");

const CRM_DEFAULT_FIELDS = [
  "name", "last_name", "email", "phone", "birth_date",
  "company", "website", "company_phone", "phone_ext",
  "position", "city", "country", "state", "postal_code",
  "address", "job_title", "privacy", "notes",
  "observations", "data_processing_consent"
];

module.exports = async function upsertContactFromSession(session) {
  try {
    const variables = session.variables || {};

    /* ── NORMALIZE ── */
    const email = typeof variables.email === "string"
      ? variables.email.toLowerCase().trim() || null
      : null;

    const phone = typeof variables.phone === "string"
      ? variables.phone.replace(/\D/g, "").trim() || null
      : null;

    const name = typeof variables.name === "string"
      ? variables.name.trim() || null
      : null;

    /* ── REQUIERE AL MENOS EMAIL O TELÉFONO ── */
    if (!email && !phone) return null;

    /* ── BUSCAR CONTACTO EXISTENTE SOLO POR contact_id ── */
    let existingContact = null;

    if (session.contact_id) {
      existingContact = await Contact.findById(session.contact_id);
    }

    /* ── MERGE Y LIMPIAR VARIABLES ── */
    const merged = { ...(existingContact?.variables || {}), ...variables };
    if (email) merged.email = email;
    if (phone) merged.phone = phone;
    if (name) merged.name = name;

    const cleanVariables = Object.fromEntries(
      Object.entries(merged).filter(([_, v]) => {
        if (v === undefined || v === null) return false;
        if (typeof v === "string" && !v.trim()) return false;
        return true;
      })
    );

    /* ── LEAD SCORE ── */
    const leadScore = calculateLeadScore({ ...session, variables: cleanVariables });

    /* ── PREPARAR DATOS ── */
    const contactData = {
      account_id: session.account_id,
      chatbot_id: session.chatbot_id,
      source: "chatbot",
      origin_url: session.origin_url,
      visitor_id: session.visitor_id,
      variables: cleanVariables,
      completed: session.is_completed === true,
      lead_score: leadScore,
      ...(session.duration_seconds && { duration_seconds: session.duration_seconds }),
      ...(!existingContact && { session_id: session._id })
    };

    // Mapear campos CRM estándar
    for (const field of CRM_DEFAULT_FIELDS) {
      if (cleanVariables[field] !== undefined) {
        contactData[field] = cleanVariables[field];
      }
    }

    /* ── ACTUALIZAR O CREAR ── */
    let contact;

    if (existingContact) {
      for (const field of CRM_DEFAULT_FIELDS) {
        if (contactData[field] === undefined && existingContact[field] !== undefined) {
          contactData[field] = existingContact[field];
        }
      }

      if (String(existingContact.chatbot_id) !== String(session.chatbot_id)) {
        contactData.last_chatbot_id = session.chatbot_id;
      }

      if (!contactData.visitor_id && existingContact.visitor_id) {
        contactData.visitor_id = existingContact.visitor_id;
      }

      contact = await Contact.findByIdAndUpdate(
        existingContact._id,
        { $set: contactData },
        { returnDocument: "after", runValidators: true }
      );

    } else {
      // ── Siempre crear contacto nuevo ──
      contact = await Contact.create(contactData);
    }

    if (session._id && contact?._id) {
      await ConversationSession.updateOne(
        { _id: session._id },
        { $set: { contact_id: contact._id } }
      );
    }

    return contact;

  } catch (error) {
    console.error("upsertContactFromSession error:", error);
    return null;
  }
};