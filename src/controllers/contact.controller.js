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
      account_id: accountId,
      is_deleted: false
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

    const updated = await Contact.findOneAndUpdate(
      {
        _id: id,
        account_id: req.user.account_id,
        is_deleted: false
      },
      { $set: { status } },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({
        message: "Contacto no encontrado"
      });
    }

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
      status: status || "new",
      completed: false,
      conversation: [],
      variables: {}
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
      account_id: accountId,
      is_deleted: false   // 👈 agregar esto
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

    const isChatbotContact =
      contact.source === "chatbot" || !contact.source;

    // 🔹 Si es contacto de chatbot, permitir actualizar conversación
    if (isChatbotContact) {
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

    const deleted = await Contact.findOneAndUpdate(
      { _id: id, account_id: accountId },
      { $set: { is_deleted: true } },
      { new: true }
    );

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
    const { source, status, search } = req.query;

    const filter = {
      account_id: accountId,
      is_deleted: false
    };

    if (status) {
      filter.status = status;
    }

    if (source === "manual") {
      filter.source = "manual";
    }

    if (source === "chatbot") {
      filter.$or = [
        { source: "chatbot" },
        { source: { $exists: false } }
      ];
    }

    if (search) {
      const searchFilter = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } }
      ];

      if (filter.$or) {
        filter.$and = [
          { $or: filter.$or },
          { $or: searchFilter }
        ];
        delete filter.$or;
      } else {
        filter.$or = searchFilter;
      }
    }

    const contacts = await Contact.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    const normalized = contacts.map(contact => ({
      ...contact,
      source: contact.source || "chatbot"
    }));

    const baseCountFilter = {
      account_id: accountId,
      is_deleted: false
    };

    const [total, total_manual, total_chatbot] = await Promise.all([
      Contact.countDocuments(baseCountFilter),

      Contact.countDocuments({
        ...baseCountFilter,
        source: "manual"
      }),

      Contact.countDocuments({
        ...baseCountFilter,
        $or: [
          { source: "chatbot" },
          { source: { $exists: false } }
        ]
      })
    ]);

    res.json({
      total,
      total_manual,
      total_chatbot,
      contacts: normalized
    });

  } catch (error) {
    console.error("GET CONTACTS ERROR:", error);
    res.status(500).json({ message: "Error al obtener contactos" });
  }
};

exports.getDeletedContacts = async (req, res) => {
  try {
    const accountId = req.user.account_id;

    const contacts = await Contact.find({
      account_id: accountId,
      is_deleted: true
    })
      .sort({ updatedAt: -1 })
      .lean();

    res.json({
      total_deleted: contacts.length,
      contacts
    });

  } catch (error) {
    console.error("GET DELETED CONTACTS ERROR:", error);
    res.status(500).json({
      message: "Error al obtener contactos eliminados"
    });
  }
};

exports.restoreContact = async (req, res) => {
  try {
    const { id } = req.params;
    const accountId = req.user.account_id;

    const restored = await Contact.findOneAndUpdate(
      {
        _id: id,
        account_id: accountId,
        is_deleted: true
      },
      { $set: { is_deleted: false } },
      { new: true }
    );

    if (!restored) {
      return res.status(404).json({
        message: "Contacto no encontrado o ya está activo"
      });
    }

    res.json({
      message: "Contacto restaurado correctamente",
      contact: restored
    });

  } catch (error) {
    console.error("RESTORE CONTACT ERROR:", error);
    res.status(500).json({
      message: "Error al restaurar contacto"
    });
  }
};

exports.permanentlyDeleteContact = async (req, res) => {
  try {
    const { id } = req.params;
    const accountId = req.user.account_id;

    const deleted = await Contact.findOneAndDelete({
      _id: id,
      account_id: accountId,
      is_deleted: true
    });

    if (!deleted) {
      return res.status(404).json({
        message: "Contacto no encontrado o no está en papelera"
      });
    }

    res.json({
      message: "Contacto eliminado permanentemente"
    });

  } catch (error) {
    console.error("HARD DELETE CONTACT ERROR:", error);
    res.status(500).json({
      message: "Error al eliminar definitivamente"
    });
  }
};