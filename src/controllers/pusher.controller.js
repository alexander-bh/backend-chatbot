// controllers/pusher.controller.js
const { pusher } = require("../services/pusher.service");

exports.auth = (req, res) => {
  const socketId = req.body.socket_id;
  const channel  = req.body.channel_name;

  if (!req.user)              return res.status(401).json({ message: "No autorizado" });
  if (!socketId || !channel)  return res.status(400).json({ message: "socket_id y channel_name requeridos" });

  /* ── Canal admin ─────────────────────────────────────────── */
  if (channel === "private-admin") {
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ message: "Solo admins pueden suscribirse a este canal" });
    }
    try {
      const authResponse = pusher.authorizeChannel(socketId, channel);
      return res.json(authResponse);
    } catch (err) {
      return res.status(500).json({ message: "Error interno de Pusher" });
    }
  }

  /* ── Canal de cuenta (clientes) ──────────────────────────── */
  const accountId       = req.user.account_id.toString();
  const expectedChannel = `private-account-${accountId}`;

  if (channel !== expectedChannel) {
    return res.status(403).json({ message: "Canal no autorizado" });
  }

  try {
    const authResponse = pusher.authorizeChannel(socketId, channel);
    return res.json(authResponse);
  } catch (err) {
    return res.status(500).json({ message: "Error interno de Pusher" });
  }
};