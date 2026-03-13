const express = require("express");
const router = express.Router();

const ConversationSession = require("../models/ConversationSession");
const vercelCron = require("./middlewares/vercelCron.middleware");

const INACTIVITY_MINUTES = 30;
const DELETE_AFTER_DAYS = 4;

router.post("/mark-abandoned", vercelCron, async (req, res) => {

  if (
    !req.headers.authorization ||
    req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return res.status(401).json({ error: "No autorizado" });
  }

  try {

    const now = new Date();

    const inactivityCutoff =
      new Date(now.getTime() - INACTIVITY_MINUTES * 60 * 1000);

    const abandoned = await ConversationSession.updateMany(
      {
        is_completed: false,
        is_abandoned: false,
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

    const deleteCutoff =
      new Date(now.getTime() - DELETE_AFTER_DAYS * 24 * 60 * 60 * 1000);

    const deleted = await ConversationSession.deleteMany({
      is_abandoned: true,
      abandoned_at: { $lt: deleteCutoff }
    });

    res.json({
      success: true,
      marked_abandoned: abandoned.modifiedCount,
      deleted: deleted.deletedCount
    });

  } catch (err) {

    console.error("[CRON ERROR]", err);

    res.status(500).json({
      error: "Error interno"
    });

  }

});

module.exports = router;