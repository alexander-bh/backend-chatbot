//public-chatbot.routes
const express = require("express");
const router = express.Router();
const controller = require("../controllers/publicChatbot.controller");
const publicRateLimit = require("../middlewares/publicRateLimit"); 
const ConversationSession = require("../models/ConversationSession");
const upsertContactFromSession = require("../services/upsertContactFromSession.service");

router.post(
  "/chatbot-conversation/:public_id/start",
  publicRateLimit,
  controller.startConversation
);

router.post(
  "/chatbot-conversation/:session_id/next",
  controller.nextPublicStep
);

router.post("/:id/abandon", async (req, res) => {
  try {
    const session = await ConversationSession.findOneAndUpdate(
      { _id: req.params.id, is_abandoned: false },
      { $set: { is_abandoned: true, abandoned_at: new Date() } },
      { new: true }
    );

    if (!session) return res.status(204).end();

    const contact = await upsertContactFromSession(session);

    if (contact && !session.contact_id) {
      await ConversationSession.updateOne(
        { _id: session._id },
        { $set: { contact_id: contact._id } }
      );
    }

  } catch (err) {
    console.error("abandon endpoint:", err);
  } finally {
    // Responder AL FINAL, después de que todo terminó
    if (!res.headersSent) res.status(204).end();
  }
});


module.exports = router;
