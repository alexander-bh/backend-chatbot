const connectDB = require("../src/config/database");
const ConversationSession = require("../src/models/ConversationSession");

const INACTIVITY_MINUTES = 30;
const DELETE_AFTER_DAYS = 1;

module.exports = async (req, res) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const token = (req.headers.authorization || "").split(" ")[1];

  if (token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "No autorizado" });
  }

  try {
    await connectDB();

    const now = new Date();

    const inactivityCutoff = new Date(
      now.getTime() - INACTIVITY_MINUTES * 60 * 1000
    );

    /* ==============================================
       1. MARCAR ABANDONADAS (BULK)
    ============================================== */

    const abandoned = await ConversationSession.updateMany(
      {
        is_completed: false,
        is_abandoned: false,
        status: "active",
        last_activity_at: { $lt: inactivityCutoff }
      },
      {
        $set: {
          is_abandoned: true,
          abandoned_at: now,
          status: "abandoned"
        }
      }
    );

    /* ==============================================
       2. ELIMINAR RECHAZADAS (BULK)
    ============================================== */

    const rejected = await ConversationSession.deleteMany({
      "variables.data_processing_consent": "rejected"
    });

    /* ==============================================
       3. ELIMINAR ABANDONADAS ANTIGUAS (BULK)
    ============================================== */

    const deleteCutoff = new Date(
      now.getTime() - DELETE_AFTER_DAYS * 24 * 60 * 60 * 1000
    );

    const deleted = await ConversationSession.deleteMany({
      is_abandoned: true,
      abandoned_at: { $lt: deleteCutoff },
      contact_id: null
    });

    console.log("[CRON] mark-abandoned", {
      marked: abandoned.modifiedCount,
      rejected: rejected.deletedCount,
      deleted: deleted.deletedCount
    });

    return res.status(200).json({
      success: true,
      marked_abandoned: abandoned.modifiedCount,
      rejected_deleted: rejected.deletedCount,
      deleted: deleted.deletedCount
    });

  } catch (err) {
    console.error("[CRON ERROR]", err);

    return res.status(500).json({
      error: "Error interno"
    });
  }
};