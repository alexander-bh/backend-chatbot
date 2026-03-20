// controllers/sse.controller.js

const clients = new Map(); // account_id → Set de respuestas activas

// ── Conectar cliente ──────────────────────────────────────────────────────────
exports.connect = (req, res) => {
  const accountId = req.user.account_id.toString();

  // Headers necesarios para SSE
  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // ← importante para Nginx/Vercel
  res.flushHeaders();

  // Registrar cliente
  if (!clients.has(accountId)) {
    clients.set(accountId, new Set());
  }
  clients.get(accountId).add(res);

  // Ping cada 30s para mantener conexión viva
  const ping = setInterval(() => {
    res.write(": ping\n\n");
  }, 30000);

  // Limpiar al desconectar
  req.on("close", () => {
    clearInterval(ping);
    clients.get(accountId)?.delete(res);
    if (clients.get(accountId)?.size === 0) {
      clients.delete(accountId);
    }
  });
};

// ── Enviar notificación a una cuenta ─────────────────────────────────────────
exports.sendToAccount = (accountId, notification) => {
  const accountClients = clients.get(accountId.toString());
  if (!accountClients?.size) return;

  const payload = `data: ${JSON.stringify(notification)}\n\n`;
  for (const res of accountClients) {
    res.write(payload);
  }
};