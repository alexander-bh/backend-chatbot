/* ─────────────────────────────────────
   HELPER — resuelve el "canal" según rol
   ADMIN  → account_id = "admin"
   CLIENT → account_id = req.user.account_id
───────────────────────────────────── */
const resolveAccountId = (user) => user.role === "ADMIN" ? "admin" : String(user.account_id);

module.exports = resolveAccountId;