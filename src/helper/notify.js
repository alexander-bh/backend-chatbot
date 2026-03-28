const { sendToAccount, sendToAdmin } = require("../services/pusher.service");
/* ─────────────────────────────────────
   HELPER — dispara el evento correcto
   según el rol del usuario
───────────────────────────────────── */
const notify = (user, event, data) => {
  if (user.role === "ADMIN") return sendToAdmin(event, data);
  return sendToAccount(String(user.account_id), event, data); 
};


module.exports = notify;