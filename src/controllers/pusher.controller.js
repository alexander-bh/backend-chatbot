// controllers/pusher.controller.js
const { pusher } = require("../services/pusher.service");

exports.auth = (req, res) => {
  const socketId    = req.body.socket_id;
  const channel     = req.body.channel_name;
  const accountId   = req.user.account_id.toString();

  // Validar que el usuario solo pueda suscribirse a su propio canal
  const expectedChannel = `private-account-${accountId}`;

  if (channel !== expectedChannel) {
    return res.status(403).json({ message: "Canal no autorizado" });
  }

  const authResponse = pusher.authorizeChannel(socketId, channel);
  res.json(authResponse);
};