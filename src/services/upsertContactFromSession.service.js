//upsertContactFromSession.service
const Contact = require("../models/Contact");

module.exports = async (session) => {
  const { name, email, phone } = session.variables;

  const query = {
    chatbot_id: session.chatbot_id
  };

  if (email) query.email = email;
  else if (phone) query.phone = phone;
  else return;

  await Contact.findOneAndUpdate(
    query,
    {
      $set: {
        account_id: session.account_id,
        chatbot_id: session.chatbot_id,
        name,
        email,
        phone
      }
    },
    {
      upsert: true,
      new: true
    }
  );
};
