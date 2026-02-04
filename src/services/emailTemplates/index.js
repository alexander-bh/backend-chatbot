// services/emailTemplates
const lead = ({ chatbot, node, message, session }) => `
  <h2>Nuevo Lead</h2>
  <p><strong>Chatbot:</strong> ${chatbot.name}</p>
  <p><strong>Email usuario:</strong> ${message.text}</p>
`;

const soporte = ({ message }) => `
  <h2>Solicitud de soporte</h2>
  <p>${message.text}</p>
`;

module.exports = {
  lead,
  soporte
};
