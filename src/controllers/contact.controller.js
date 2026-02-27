const Contact = require("../models/Contact");
const formatDate = require("../utils/formatDate");

/* =========================
   CREATE CONTACT
========================= */
exports.createContact = async (req, res) => {
  try {

    const {
      chatbot_id,
      session_id,
      name,
      email,
      phone,
      conversation,
      responses,
      completed
    } = req.body;

    if (!chatbot_id || !session_id) {
      return res.status(400).json({
        message: "chatbot_id y session_id son requeridos"
      });
    }

    const contact = await Contact.create({
      chatbot_id,
      session_id,
      name,
      email,
      phone,
      conversation: Array.isArray(conversation) ? conversation : [],
      responses: responses || {},
      completed: completed || false
    });

    res.status(201).json(contact);

  } catch (error) {
    console.error("CREATE CONTACT ERROR:", error);
    res.status(500).json({
      message: "Error al guardar contacto"
    });
  }
};

/* =========================
   GET CONTACTS BY CHATBOT
========================= */
exports.getContactsByChatbot = async (req, res) => {
  try {
    const { chatbot_id } = req.params;
    const { status } = req.query;
    const accountId = req.user.account_id;

    /* ===============================
       1️⃣ CONTACTOS DEL CHATBOT
    =============================== */

    const filter = {
      chatbot_id,
      account_id: accountId
    };

    if (status) {
      filter.status = status;
    }

    const contacts = await Contact
      .find(filter)
      .sort({ createdAt: -1 })
      .lean();

    const formatted = contacts.map(c => ({
      ...c,
      created_at_formatted: formatDate(c.createdAt)
    }));

    /* ===============================
       2️⃣ TOTAL GENERAL (TODOS LOS CHATBOTS)
    =============================== */

    const total_contacts_general = await Contact.countDocuments({
      account_id: accountId
    });

    /* ===============================
       RESPONSE
    =============================== */

    res.json({
      total_contacts_chatbot: contacts.length,
      total_contacts_general,
      contacts: formatted
    });

  } catch (error) {
    console.error("GET CONTACTS ERROR:", error);
    res.status(500).json({
      message: "Error al obtener contactos"
    });
  }
};

/* =========================
   UPDATE CONTACT STATUS
========================= */
exports.updateStatus = async (req, res) => {
  try {

    const { id } = req.params;
    const { status } = req.body;

    const allowed = ["new", "contacted", "qualified", "lost"];

    if (!allowed.includes(status)) {
      return res.status(400).json({
        message: "Estado inválido"
      });
    }

    const updated = await Contact.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );

    res.json(updated);

  } catch (error) {
    console.error("UPDATE STATUS ERROR:", error);
    res.status(500).json({
      message: "Error al actualizar estado"
    });
  }
};