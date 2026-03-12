// upsertContactFromSession.service.js

const Contact = require("../models/Contact");
const calculateLeadScore = require("../services/leadScore.service");

const CRM_DEFAULT_FIELDS = [
  "name",
  "last_name",
  "email",
  "phone",
  "birth_date",
  "company",
  "website",
  "company_phone",
  "phone_ext",
  "position",
  "city",
  "country",
  "state",
  "postal_code",
  "address",
  "job_title",
  "privacy",
  "notes",
  "observations",
  "data_processing_consent"
];

module.exports = async function upsertContactFromSession(session) {

  try {

    const variables = session.variables || {};

    /* ===============================
       NORMALIZE INPUT
    =============================== */

    const email =
      typeof variables.email === "string"
        ? variables.email.toLowerCase().trim()
        : null;

    const phone =
      typeof variables.phone === "string"
        ? variables.phone.replace(/\D/g, "")
        : null;

    const name =
      typeof variables.name === "string"
        ? variables.name.trim()
        : null;

    /* ===============================
       VALIDATE LEAD DATA
    =============================== */

    const hasImportantLead = email || phone || name;

    if (!hasImportantLead) {
      return null;
    }

    /* ===============================
       FIND EXISTING CONTACT
    =============================== */

    let existingContact = null;

    if (session.contact_id) {
      existingContact = await Contact.findById(session.contact_id);
    }

    // 2️⃣ Buscar por email
    if (!existingContact && email) {

      existingContact = await Contact.findOne({
        account_id: session.account_id,
        email,
        is_deleted: { $ne: true }
      });

    }


    if (!existingContact && phone) {

      existingContact = await Contact.findOne({
        account_id: session.account_id,
        phone,
        is_deleted: { $ne: true }
      });

    }

    if (!existingContact && session.visitor_id) {

      existingContact = await Contact.findOne({
        account_id: session.account_id,
        visitor_id: session.visitor_id,
        is_deleted: { $ne: true }
      });

    }

    /* ===============================
       MERGE VARIABLES
    =============================== */

    const mergedVariables = {
      ...(existingContact?.variables || {}),
      ...variables
    };

    if (email) mergedVariables.email = email;
    if (phone) mergedVariables.phone = phone;
    if (name) mergedVariables.name = name;

    /* ===============================
       VALIDATE CRM DATA
    =============================== */

    const hasCRMData = CRM_DEFAULT_FIELDS.some(field => {

      const value = mergedVariables[field];

      if (typeof value === "string") {
        return value.trim().length > 0;
      }

      return value !== undefined && value !== null;

    });

    if (!hasCRMData) {
      return null;
    }

    /* ===============================
       CLEAN VARIABLES
    =============================== */

    const cleanVariables = {};

    for (const key of Object.keys(mergedVariables)) {

      const value = mergedVariables[key];

      if (value === undefined || value === null) continue;

      if (typeof value === "string" && !value.trim()) continue;

      cleanVariables[key] = value;

    }

    /* ===============================
       LEAD SCORE
    =============================== */

    const leadScore = calculateLeadScore({
      ...session,
      variables: cleanVariables
    });

    /* ===============================
       PREPARE CONTACT DATA
    =============================== */

    const contactData = {
      account_id: session.account_id,
      chatbot_id: session.chatbot_id,
      source: "chatbot",
      origin_url: session.origin_url,
      visitor_id: session.visitor_id,
      variables: {
        ...(existingContact?.variables || {}),
        ...cleanVariables
      },
      completed: session.is_completed === true,
      lead_score: leadScore
    };

    if (!existingContact) {
      contactData.session_id = session._id;
    }

    if (session.duration_seconds) {
      contactData.duration_seconds = session.duration_seconds;
    }

    /* ===============================
       MAP CRM FIELDS
    =============================== */

    for (const field of CRM_DEFAULT_FIELDS) {

      const value = cleanVariables[field];

      if (value !== undefined) {
        contactData[field] = value;
      }

    }

    let contact;

    /* ===============================
       UPDATE EXISTING CONTACT
    =============================== */

    if (existingContact) {

      const safeContactData = { ...contactData };

      // conservar datos existentes si no llegan nuevos
      for (const field of CRM_DEFAULT_FIELDS) {

        if (
          safeContactData[field] === undefined &&
          existingContact[field] !== undefined
        ) {
          safeContactData[field] = existingContact[field];
        }

      }

      // guardar último chatbot
      if (existingContact.chatbot_id !== session.chatbot_id) {
        safeContactData.last_chatbot_id = session.chatbot_id;
      }

      // preservar visitor_id existente
      if (!safeContactData.visitor_id && existingContact.visitor_id) {
        safeContactData.visitor_id = existingContact.visitor_id;
      }

      contact = await Contact.findByIdAndUpdate(
        existingContact._id,
        { $set: safeContactData },
        { new: true }
      );

    }

    /* ===============================
       CREATE NEW CONTACT
    =============================== */

    else {

      contact = await Contact.create(contactData);

    }

    return contact;

  }

  catch (error) {

    console.error(
      "upsertContactFromSession error:",
      error
    );

    return null;

  }

};