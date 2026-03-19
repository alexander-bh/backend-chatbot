const connectDB = require("../../src/config/database");
const Contact = require("../../src/models/Contact");
const ConversationSession = require("../../src/models/ConversationSession");

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

    /* ==============================================
       1. LOST → DISCARDED (BULK)
    ============================================== */

    const lostResult = await Contact.updateMany(
      {
        status: "lost",
        is_deleted: false,
        lost_limit_at: { $ne: null, $lte: now }
      },
      {
        $set: {
          status: "discarded",
          status_changed_at: now,
          lost_limit_at: null
        }
      }
    );

    /* ==============================================
       2. DISCARDED → ELIMINAR (BULK)
    ============================================== */

    const discardedContacts = await Contact.find(
      {
        status: "discarded",
        is_deleted: false,
        discarded_limit_at: { $ne: null, $lte: now }
      },
      { _id: 1, session_id: 1, account_id: 1 }
    ).lean();

    const idsToDelete = discardedContacts.map(c => c._id);

    const sessionIds = discardedContacts
      .filter(c => c.session_id)
      .map(c => c.session_id);

    if (sessionIds.length > 0) {
      await ConversationSession.deleteMany({
        _id: { $in: sessionIds }
      });
    }

    if (idsToDelete.length > 0) {
      await Contact.deleteMany({
        _id: { $in: idsToDelete }
      });
    }

    console.log("[CRON] process-contact-limits", {
      markedDiscarded: lostResult.modifiedCount,
      deletedContacts: idsToDelete.length
    });

    return res.status(200).json({
      success: true,
      marked_discarded: lostResult.modifiedCount,
      deleted_contacts: idsToDelete.length
    });

  } catch (err) {
    console.error("[CRON ERROR CONTACT LIMITS]", err);

    return res.status(500).json({
      error: "Error interno"
    });
  }
};