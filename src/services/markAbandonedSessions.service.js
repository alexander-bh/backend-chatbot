// services/markAbandonedSessions.service.js

const ConversationSession = require("../models/ConversationSession");
const upsertContactFromSession = require("./upsertContactFromSession.service");

const ABANDON_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutos

/**
 * Marca sesiones inactivas del visitor/account como abandonadas.
 * Se llama de forma lazy desde nextStep o startConversation.
 * NO bloquea la respuesta — se ejecuta en background con .catch()
 */
module.exports = async function markAbandonedSessions({
  account_id,
  visitor_id,
  exclude_session_id = null
}) {
  try {
    const cutoff = new Date(Date.now() - ABANDON_TIMEOUT_MS);

    const query = {
      account_id,
      is_completed: false,
      is_abandoned: false,
      last_activity_at: { $lt: cutoff }
    };

    // Si tenemos visitor_id, buscamos sus sesiones
    // Si no, limitamos por account para no hacer full scan
    if (visitor_id) {
      query.visitor_id = visitor_id;
    } else {
      return; // Sin visitor_id no vale la pena buscar
    }

    if (exclude_session_id) {
      query._id = { $ne: exclude_session_id };
    }

    const staleSessions = await ConversationSession.find(query)
      .limit(5) // Nunca más de 5 para no bloquear
      .lean();

    for (const stale of staleSessions) {
      // Actualizar en DB
      await ConversationSession.findByIdAndUpdate(stale._id, {
        $set: {
          is_abandoned: true,
          abandoned_at: new Date()
        }
      });

      // Guardar contacto con lo que tenía
      const hydratedSession = {
        ...stale,
        is_completed: false,
        is_abandoned: true
      };

      await upsertContactFromSession(hydratedSession);
    }
  } catch (err) {
    console.error("markAbandonedSessions:", err);
  }
};