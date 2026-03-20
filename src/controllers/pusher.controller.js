// controllers/pusher.controller.js
const { pusher } = require("../services/pusher.service");

exports.auth = (req, res) => {

  // ── Diagnóstico ───────────────────────────────────────────────────────────
  console.log("=== PUSHER AUTH ===");
  console.log("Authorization header:", req.headers.authorization);
  console.log("socket_id:",            req.body.socket_id);
  console.log("channel_name:",         req.body.channel_name);
  console.log("req.user:",             req.user);
  console.log("PUSHER_APP_ID existe:", !!process.env.PUSHER_APP_ID);
  console.log("PUSHER_KEY existe:",    !!process.env.PUSHER_KEY);
  console.log("PUSHER_SECRET existe:", !!process.env.PUSHER_SECRET);
  console.log("PUSHER_CLUSTER existe:",!!process.env.PUSHER_CLUSTER);
  // ─────────────────────────────────────────────────────────────────────────

  const socketId  = req.body.socket_id;
  const channel   = req.body.channel_name;

  if (!req.user) {
    console.log("❌ req.user es undefined — problema con el middleware auth");
    return res.status(401).json({ message: "No autorizado" });
  }

  if (!socketId || !channel) {
    console.log("❌ Faltan socket_id o channel_name");
    return res.status(400).json({ message: "socket_id y channel_name requeridos" });
  }

  const accountId       = req.user.account_id.toString();
  const expectedChannel = `private-account-${accountId}`;

  console.log("canal recibido:", channel);
  console.log("canal esperado:", expectedChannel);
  console.log("coinciden:",      channel === expectedChannel);

  if (channel !== expectedChannel) {
    console.log("❌ Canal no autorizado");
    return res.status(403).json({ message: "Canal no autorizado" });
  }

  try {
    const authResponse = pusher.authorizeChannel(socketId, channel);
    console.log("✅ Auth exitoso");
    res.json(authResponse);
  } catch (err) {
    console.log("❌ Error en authorizeChannel:", err.message);
    res.status(500).json({ message: "Error interno de Pusher" });
  }
};