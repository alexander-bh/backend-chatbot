const Contact = require("../models/Contact");
const formatDate = require("../utils/formatDate");

exports.createContact = async (req, res) => {
  try {
    const accountId = req.user.account_id;

    const {
      chatbot_id,
      session_id,
      name,
      email,
      phone,
      conversation,
      variables,
      completed
    } = req.body;

    if (!chatbot_id || !session_id) {
      return res.status(400).json({
        message: "chatbot_id y session_id son requeridos"
      });
    }

    const contact = await Contact.create({
      account_id: accountId,
      chatbot_id,
      session_id,
      source: "chatbot",
      name,
      email,
      phone,
      conversation: Array.isArray(conversation) ? conversation : [],
      variables: variables || {},
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

exports.createManualContact = async (req, res) => {
  try {
    const accountId = req.user.account_id;

    const {
      name,
      email,
      phone,
      company,
      website,
      city,
      country,
      address,
      position,
      internal_note,
      status
    } = req.body;

    if (!name) {
      return res.status(400).json({
        message: "El nombre es requerido"
      });
    }

    const contact = await Contact.create({
      account_id: accountId,
      source: "manual",
      name,
      email,
      phone,
      company,
      website,
      city,
      country,
      address,
      position,
      internal_note,
      status: status || "new"
    });

    res.status(201).json(contact);

  } catch (error) {
    console.error("CREATE MANUAL CONTACT ERROR:", error);
    res.status(500).json({
      message: "Error al crear prospecto"
    });
  }
};

exports.updateContact = async (req, res) => {
  try {
    const { id } = req.params;
    const accountId = req.user.account_id;
    const updates = req.body;

    // 🔒 Buscar el contacto primero
    const contact = await Contact.findOne({
      _id: id,
      account_id: accountId
    });

    if (!contact) {
      return res.status(404).json({
        message: "Contacto no encontrado"
      });
    }

    // 🔹 Campos permitidos para TODOS
    const commonFields = [
      "name",
      "email",
      "phone",
      "company",
      "website",
      "city",
      "country",
      "address",
      "position",
      "internal_note",
      "status",
      "completed"
    ];

    // 🔹 Campos solo para chatbot
    const chatbotFields = [
      "conversation",
      "variables"
    ];

    const allowedStatus = ["new", "contacted", "qualified", "lost"];

    if (updates.status && !allowedStatus.includes(updates.status)) {
      return res.status(400).json({
        message: "Estado inválido"
      });
    }

    const safeUpdates = {};

    // 🔹 Campos comunes
    for (let field of commonFields) {
      if (updates[field] !== undefined) {
        safeUpdates[field] = updates[field];
      }
    }

    // 🔹 Si es contacto de chatbot, permitir actualizar conversación
    if (contact.source === "chatbot") {
      for (let field of chatbotFields) {
        if (updates[field] !== undefined) {
          safeUpdates[field] = updates[field];
        }
      }
    }

    // 🚫 Nunca permitir modificar estos campos
    delete safeUpdates.account_id;
    delete safeUpdates.source;
    delete safeUpdates.chatbot_id;
    delete safeUpdates.session_id;

    const updated = await Contact.findByIdAndUpdate(
      id,
      { $set: safeUpdates },
      { new: true }
    );

    res.json(updated);

  } catch (error) {
    console.error("UPDATE CONTACT ERROR:", error);
    res.status(500).json({
      message: "Error al actualizar contacto"
    });
  }
};

exports.deleteContact = async (req, res) => {
  try {
    const { id } = req.params;
    const accountId = req.user.account_id;

    const deleted = await Contact.findOneAndDelete({
      _id: id,
      account_id: accountId
    });

    if (!deleted) {
      return res.status(404).json({
        message: "Contacto no encontrado"
      });
    }

    res.json({
      message: "Contacto eliminado correctamente"
    });

  } catch (error) {
    console.error("DELETE CONTACT ERROR:", error);
    res.status(500).json({
      message: "Error al eliminar contacto"
    });
  }
};

exports.getContacts = async (req, res) => {
  try {
    const accountId = req.user.account_id;
    const { chatbot_id, source, status } = req.query;

    const filter = {
      account_id: accountId
    };

    if (chatbot_id) {
      filter.chatbot_id = chatbot_id;
    }

    if (source && ["manual", "chatbot", "import"].includes(source)) {
      filter.source = source;
    }

    // 🔹 Filtro por status
    if (status) {
      filter.status = status;
    }

    const contacts = await Contact.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    const total = contacts.length;

    const total_manual = await Contact.countDocuments({
      account_id: accountId,
      source: "manual"
    });

    const total_chatbot = await Contact.countDocuments({
      account_id: accountId,
      source: "chatbot"
    });

    res.json({
      total,
      total_manual,
      total_chatbot,
      contacts
    });

  } catch (error) {
    console.error("GET CONTACTS ERROR:", error);
    res.status(500).json({ message: "Error al obtener contactos" });
  }
};