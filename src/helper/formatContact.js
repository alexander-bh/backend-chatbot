const formatDateAMPM = require("../utils/formatDate");

const formatContact = (contact) => {
  const obj = contact.toObject ? contact.toObject() : contact;
  return {
    ...obj,
    source: obj.source || "chatbot",
    createdAtFormatted: obj.createdAt ? formatDateAMPM(obj.createdAt) : null,
    updatedAtFormatted: obj.updatedAt ? formatDateAMPM(obj.updatedAt) : null
  };
};

module.exports = formatContact;