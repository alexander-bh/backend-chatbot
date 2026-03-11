const mongoose = require("mongoose");
const Contact = require("../models/Contact");
const formatDateAMPM = require("../utils/formatDate");
const ConversationSession = require("../models/ConversationSession");

const formatContact = (contact) => {
  const obj = contact.toObject ? contact.toObject() : contact;

  return {
    ...obj,
    source: obj.source || "chatbot",
    createdAtFormatted: obj.createdAt ? formatDateAMPM(obj.createdAt) : null,
    updatedAtFormatted: obj.updatedAt ? formatDateAMPM(obj.updatedAt) : null
  };
};

exports.createContact = async (req, res) => {
  try {

    const accountId = req.user.account_id;

    const {
      chatbot_id,
      session_id,
      variables,
      completed,
      visitor_id,
      origin_url,
      device,
      ip_address
    } = req.body;

    if (!chatbot_id || !session_id) {
      return res.status(400).json({
        message: "chatbot_id y session_id son requeridos"
      });
    }

    const allowedFields = [
      "name",
      "last_name",
      "email",
      "phone",
      "birth_date",
      "company",
      "website",
      "company_phone",
      "phone_ext",
      "position",
      "city",
      "country",
      "state",
      "postal_code",
      "address",
      "job_title",
      "privacy",
      "notes",
      "observations",
      "data_processing_consent"
    ];

    const insertData = {
      account_id: accountId,
      chatbot_id,
      session_id,
      visitor_id,
      origin_url,
      device,
      ip_address,
      source: "chatbot"
    };

    const updateData = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    if (variables) {
      updateData.variables = variables;
    }

    if (visitor_id) {
      updateData.visitor_id = visitor_id;
    }

    if (completed !== undefined) {
      updateData.completed = completed;
    }

    const contact = await Contact.findOneAndUpdate(
      {
        account_id: accountId,
        chatbot_id,
        session_id
      },
      {
        $setOnInsert: insertData,
        $set: updateData
      },
      {
        new: true,
        upsert: true
      }
    );

    res.status(200).json(formatContact(contact));

  } catch (error) {

    console.error("CREATE CONTACT ERROR:", error);

    if (error.code === 11000) {
      return res.status(200).json({
        message: "Contacto ya existente"
      });
    }

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

    const formatted = contacts.map(formatContact);

    const total_contacts_general = await Contact.countDocuments({
      account_id: accountId,
      is_deleted: false
    });

    res.json({
      total_contacts_chatbot: formatted.length,
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

    /* =========================
       VALIDAR ID
    ========================= */
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "ID inválido"
      });
    }

    /* =========================
       VALIDAR STATUS
    ========================= */
    const allowed = ["new", "contacted", "qualified", "lost"];

    if (!allowed.includes(status)) {
      return res.status(400).json({
        message: "Estado inválido"
      });
    }

    /* =========================
       BUSCAR CONTACTO
    ========================= */
    const contact = await Contact.findById(id);

    if (!contact || contact.is_deleted) {
      return res.status(404).json({
        message: "Contacto no encontrado"
      });
    }

    /* =========================
       REGLAS DE PERMISOS
    ========================= */

    const isAdmin = req.user.role === "ADMIN";
    const sameAccount =
      contact.account_id &&
      contact.account_id.toString() === req.user.account_id?.toString();

    // 🧩 Si es plantilla → solo ADMIN
    if (contact.is_template && !isAdmin) {
      return res.status(403).json({
        message: "Solo ADMIN puede modificar plantillas"
      });
    }

    // 👤 Si es contacto normal → dueño o ADMIN
    if (!contact.is_template && !sameAccount && !isAdmin) {
      return res.status(403).json({
        message: "Sin permisos para modificar este contacto"
      });
    }

    /* =========================
       UPDATE
    ========================= */
    contact.status = status;
    await contact.save();

    res.json(formatContact(contact));

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

    const data = {
      account_id: accountId,
      source: "manual",
      completed: false,
      variables: {},
      status: req.body.status || "new"
    };

    const allowedFields = [
      // 👤 Personales
      "name",
      "last_name",
      "email",
      "phone",
      "birth_date",

      // 🏢 Empresa
      "company",
      "website",
      "company_phone",
      "phone_ext",
      "position",
      "city",
      "country",
      "state",
      "postal_code",
      "address",
      "job_title",
      "privacy",
      "notes",

      // 📝 Extra
      "observations",
      "data_processing_consent"
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        data[field] = req.body[field];
      }
    }

    const contact = await Contact.create(data);

    res.status(201).json(formatContact(contact));

  } catch (error) {
    console.error("CREATE MANUAL CONTACT ERROR:", error);

    res.status(500).json({
      message: "Error al crear contacto"
    });
  }
};

exports.updateContact = async (req, res) => {
  try {
    const { id } = req.params;
    const accountId = req.user.account_id;
    const updates = req.body;

    /* =========================
       VALIDAR ID
    ========================= */
    if (!id || id === "null" || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "ID de contacto inválido"
      });
    }

    /* =========================
       BUSCAR CONTACTO
    ========================= */
    const contact = await Contact.findOne({
      _id: id,
      account_id: accountId,
      is_deleted: false
    });

    if (!contact) {
      return res.status(404).json({
        message: "Contacto no encontrado"
      });
    }

    /* =========================
       VALIDAR STATUS
    ========================= */
    const allowedStatus = ["new", "contacted", "qualified", "lost"];

    if (updates.status && !allowedStatus.includes(updates.status)) {
      return res.status(400).json({
        message: "Estado inválido"
      });
    }

    /* =========================
       CAMPOS PERMITIDOS
    ========================= */
    const allowedFields = [
      // 👤 Personales
      "name",
      "last_name",
      "email",
      "phone",
      "birth_date",

      // 🏢 Empresa
      "company",
      "website",
      "company_phone",
      "phone_ext",
      "position",
      "city",
      "country",
      "state",
      "postal_code",
      "address",
      "job_title",
      "privacy",
      "notes",

      // 📝 Extra
      "observations",
      "data_processing_consent",
      "status",
      "completed",
      "variables"
    ];

    const safeUpdates = {};

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        safeUpdates[field] = updates[field];
      }
    }

    /* =========================
       CAMPOS PROTEGIDOS
    ========================= */
    delete safeUpdates.account_id;
    delete safeUpdates.source;
    delete safeUpdates.chatbot_id;
    delete safeUpdates.session_id;
    delete safeUpdates.is_deleted;

    /* =========================
       UPDATE
    ========================= */
    const updated = await Contact.findOneAndUpdate(
      {
        _id: id,
        account_id: accountId,
        is_deleted: false
      },
      { $set: safeUpdates },
      {
        new: true,
        runValidators: true
      }
    );

    return res.json(formatContact(updated));

  } catch (error) {
    console.error("UPDATE CONTACT ERROR:", error);

    return res.status(500).json({
      message: "Error al actualizar contacto"
    });
  }
};

exports.deleteContact = async (req, res) => {
  try {
    const { id } = req.params;
    const accountId = req.user.account_id;

    const contact = await Contact.findOne({
      _id: id,
      account_id: accountId,
      is_deleted: false
    });

    if (!contact) {
      return res.status(404).json({
        message: "Contacto no encontrado"
      });
    }

    /* ================= SOFT DELETE CONTACT ================= */

    contact.is_deleted = true;
    await contact.save();

    /* ================= SOFT DELETE CONVERSATION ================= */

    await ConversationSession.updateOne(
      {
        _id: contact.session_id,
        account_id: accountId
      },
      {
        $set: { is_deleted: true }
      }
    );

    return res.json({
      message: "Contacto y conversación eliminados correctamente",
      contact: formatContact(contact)
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

    /* ================= FILTRO BASE ================= */

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

    /* ================= OBTENER CONTACTOS ================= */

    const contacts = await Contact.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    /* ================= NORMALIZAR ================= */

    const normalized = contacts.map(formatContact);

    /* ================= CONTADORES ================= */

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

    // Obtener todos los contactos eliminados
    const contacts = await Contact.find({
      account_id: accountId,
      is_deleted: true
    })
      .sort({ updatedAt: -1 })
      .lean();

    // Formatear contactos
    const formatted = contacts.map(formatContact);

    res.json({
      total_deleted: formatted.length,
      contacts: formatted
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

    const contact = await Contact.findOne({
      _id: id,
      account_id: accountId,
      is_deleted: true
    });

    if (!contact) {
      return res.status(404).json({
        message: "Contacto no encontrado o ya está activo"
      });
    }

    contact.is_deleted = false;
    await contact.save();

    await ConversationSession.updateOne(
      {
        _id: contact.session_id,
        account_id: accountId
      },
      {
        $set: { is_deleted: false }
      }
    );
    res.json({
      message: "Contacto restaurado correctamente",
      contact: formatContact(contact)
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

    const contact = await Contact.findOne({
      _id: id,
      account_id: accountId,
      is_deleted: true
    });

    if (!contact) {
      return res.status(404).json({
        message: "Contacto no encontrado o no está en papelera"
      });
    }

    /* ================= DELETE CONVERSATION ================= */

    await ConversationSession.deleteOne({
      _id: contact.session_id,
      account_id: accountId
    });

    /* ================= DELETE CONTACT ================= */

    await Contact.deleteOne({
      _id: id
    });

    res.json({
      message: "Contacto y conversación eliminados permanentemente"
    });

  } catch (error) {
    console.error("HARD DELETE CONTACT ERROR:", error);
    res.status(500).json({
      message: "Error al eliminar definitivamente"
    });
  }
};