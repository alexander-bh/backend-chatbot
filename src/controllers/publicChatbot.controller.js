// controllers/publicChatbot.controller.js
const Chatbot = require("../models/Chatbot");
const engine = require("./conversationsession.controller");

exports.startConversation = async (req, res) => {
  try {
    const { public_id } = req.params;
    const { origin_url } = req.body;

    const chatbot = await Chatbot.findOne({
      public_id,
      status: "active"
    });

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no disponible" });
    }

    // 🔥 delegar al motor REAL
    const fakeReq = {
      body: {
        chatbot_id: chatbot._id,
        mode: "production",
        origin_url
      },
      user: {
        account_id: chatbot.account_id
      }
    };

    return engine.startConversation(fakeReq, res);

  } catch (error) {
    console.error("public startConversation:", error);
    return res.status(500).json({
      message: "Error al iniciar conversación"
    });
  }
};

exports.nextPublicStep = async (req, res) => {
  try {
    const { session_id } = req.params;
    const { input } = req.body;

    const fakeReq = {
      params: { id: session_id },
      body: { input }
    };

    return engine.nextStep(fakeReq, res);

  } catch (err) {
    console.error("nextPublicStep:", err);
    return res.status(500).json({
      message: "Error en conversación pública"
    });
  }
};