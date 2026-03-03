// upsertContactFromSession.service.js
const Contact = require("../models/Contact");

module.exports = async function upsertContactFromSession(session) {
  try {

    await Contact.findOneAndUpdate(
      {
        session_id: session._id
      },
      {
        account_id: session.account_id,
        chatbot_id: session.chatbot_id,
        session_id: session._id,
        source: "chatbot",
        variables: session.variables,
        origin_url: session.origin_url,
        completed: session.is_completed
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    );

  } catch (error) {
    console.error("upsertContactFromSession error:", error);
  }
};