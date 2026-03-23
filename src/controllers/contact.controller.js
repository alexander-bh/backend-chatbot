const mongoose = require("mongoose");
const Contact = require("../models/Contact");
const formatDateAMPM = require("../utils/formatDate");
const ConversationSession = require("../models/ConversationSession");
const { sendToAccount } = require("../services/pusher.service");

const formatContact = (contact) => {
  const obj = contact.toObject ? contact.toObject() : contact;

  return {
    ...obj,
    source: obj.source || "chatbot",
    createdAtFormatted: obj.createdAt ? formatDateAMPM(obj.createdAt) : null,
    updatedAtFormatted: obj.updatedAt ? formatDateAMPM(obj.updatedAt) : null
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Chatbot contact (upsert)
// Evento: "contact-created"
// ─────────────────────────────────────────────────────────────────────────────
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
      "name", "last_name", "email", "phone", "birth_date",
      "company", "website", "company_phone", "phone_ext", "position",
      "city", "country", "state", "postal_code", "address", "job_title",
      "privacy", "notes", "observations", "data_processing_consent"
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

    if (variables)             updateData.variables  = variables;
    if (visitor_id)            updateData.visitor_id = visitor_id;
    if (completed !== undefined) updateData.completed = completed;

    const contact = await Contact.findOneAndUpdate(
      { account_id: accountId, chatbot_id, session_id },
      { $setOnInsert: insertData, $set: updateData },
      { returnDocument: "after", upsert: true }
    );

    // ── Pusher ────────────────────────────────────────────────────────────────
    sendToAccount(accountId, "contact-created", formatContact(contact));
    // ─────────────────────────────────────────────────────────────────────────

    res.status(200).json(formatContact(contact));

  } catch (error) {
    console.error("CREATE CONTACT ERROR:", error);

    if (error.code === 11000) {
      return res.status(200).json({ message: "Contacto ya existente" });
    }

    res.status(500).json({ message: "Error al guardar contacto" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Contactos por chatbot (solo lectura, sin evento Pusher)
// ─────────────────────────────────────────────────────────────────────────────
exports.getContactsByChatbot = async (req, res) => {
  try {
    const { chatbot_id } = req.params;
    const { status }     = req.query;
    const accountId      = req.user.account_id;

    const filter = { chatbot_id, account_id: accountId, is_deleted: false };
    if (status) filter.status = status;

    const contacts = await Contact.find(filter).sort({ createdAt: -1 }).lean();
    const formatted = contacts.map(formatContact);

    const total_contacts_general = await Contact.countDocuments({
      account_id: accountId,
      is_deleted: false
    });

    res.json({ total_contacts_chatbot: formatted.length, total_contacts_general, contacts: formatted });

  } catch (error) {
    console.error("GET CONTACTS ERROR:", error);
    res.status(500).json({ message: "Error al obtener contactos" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Cambio de estado
// Evento: "contact-status-updated"  →  { id, status }
// ─────────────────────────────────────────────────────────────────────────────
exports.updateStatus = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id }     = req.params;
    const { status } = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID inválido" });
    }

    const allowed = ["new", "contacted", "qualified", "lost", "discarded"];
    if (!status || !allowed.includes(status)) {
      return res.status(400).json({ message: "Estado inválido" });
    }

    const contact = await Contact.findById(id).session(session);

    if (!contact || contact.is_deleted) {
      return res.status(404).json({ message: "Contacto no encontrado" });
    }

    const isAdmin     = req.user.role === "ADMIN";
    const sameAccount = contact.account_id?.toString() === req.user.account_id?.toString();

    if (contact.is_template && !isAdmin) {
      return res.status(403).json({ message: "Solo ADMIN puede modificar plantillas" });
    }

    if (!contact.is_template && !sameAccount && !isAdmin) {
      return res.status(403).json({ message: "Sin permisos para modificar este contacto" });
    }

    contact.status            = status;
    contact.status_changed_at = new Date();

    if (!["lost", "discarded"].includes(status)) {
      contact.lost_limit_at      = null;
      contact.discarded_limit_at = null;
      contact.status_changed_at  = null;
    }

    if (status === "lost")                               contact.completed = false;
    if (status === "contacted" || status === "qualified") contact.completed = true;

    await contact.save({ session });

    let conversationUpdate = null;

    if (status === "lost") {
      conversationUpdate = {
        is_completed: false,
        is_abandoned: true,
        abandoned_at: new Date(),
        status: "abandoned",
        contact_id: contact._id
      };
    }

    if (status === "contacted" || status === "qualified") {
      conversationUpdate = {
        is_completed: true,
        is_abandoned: false,
        abandoned_at: null,
        status: "completed",
        contact_id: contact._id
      };
    }

    if (conversationUpdate && contact.session_id) {
      await ConversationSession.updateOne(
        { _id: contact.session_id, account_id: contact.account_id },
        { $set: conversationUpdate },
        { session }
      );
    }

    await session.commitTransaction();

    // ── Pusher ────────────────────────────────────────────────────────────────
    // Payload ligero: solo id + nuevo status (evita enviar el doc completo)
    sendToAccount(contact.account_id, "contact-status-updated", {
      id:     contact._id,
      status: contact.status
    });
    // ─────────────────────────────────────────────────────────────────────────

    res.json(formatContact(contact));

  } catch (error) {
    await session.abortTransaction();
    console.error("UPDATE STATUS ERROR:", error);
    res.status(500).json({ message: "Error al actualizar estado" });
  } finally {
    session.endSession();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Límites lost/discarded  (sin evento Pusher: cambio interno, no afecta la lista)
// ─────────────────────────────────────────────────────────────────────────────
exports.updateLimits = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { lost_limit_at, discarded_limit_at, discarded_reason, discarded_notes } = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID inválido" });
    }

    if (lost_limit_at === undefined && discarded_limit_at === undefined) {
      return res.status(400).json({
        message: "Se requiere al menos un campo: lost_limit_at o discarded_limit_at"
      });
    }

    const contact = await Contact.findById(id).session(session);
    if (!contact || contact.is_deleted) {
      return res.status(404).json({ message: "Contacto no encontrado" });
    }

    const isAdmin     = req.user.role === "ADMIN";
    const sameAccount = contact.account_id?.toString() === req.user.account_id?.toString();

    if (contact.is_template && !isAdmin) {
      return res.status(403).json({ message: "Solo ADMIN puede modificar plantillas" });
    }

    if (!contact.is_template && !sameAccount && !isAdmin) {
      return res.status(403).json({ message: "Sin permisos para modificar este contacto" });
    }

    if (!["lost", "discarded"].includes(contact.status)) {
      return res.status(400).json({
        message: "Solo se pueden definir límites en contactos con estado 'lost' o 'discarded'"
      });
    }

    if (lost_limit_at !== undefined && contact.status !== "lost") {
      return res.status(400).json({ message: "lost_limit_at solo aplica para estado 'lost'" });
    }

    if (discarded_limit_at !== undefined && contact.status !== "discarded") {
      return res.status(400).json({ message: "discarded_limit_at solo aplica para estado 'discarded'" });
    }

    if (lost_limit_at !== undefined)      contact.lost_limit_at      = lost_limit_at      ? new Date(lost_limit_at)      : null;
    if (discarded_limit_at !== undefined)  contact.discarded_limit_at = discarded_limit_at ? new Date(discarded_limit_at) : null;

    if (contact.status === "discarded") {
      if (discarded_reason !== undefined) contact.discarded_reason = discarded_reason || null;
      if (discarded_notes  !== undefined) contact.discarded_notes  = discarded_notes?.trim() || null;
    }

    await contact.save({ session });
    await session.commitTransaction();

    res.json(formatContact(contact));

  } catch (error) {
    await session.abortTransaction();
    console.error("UPDATE LIMITS ERROR:", error);
    res.status(500).json({ message: "Error al actualizar límites" });
  } finally {
    session.endSession();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Crear contacto manual
// Evento: "contact-created"
// ─────────────────────────────────────────────────────────────────────────────
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
      "name", "last_name", "email", "phone", "birth_date",
      "company", "website", "company_phone", "phone_ext", "position",
      "city", "country", "state", "postal_code", "address", "job_title",
      "privacy", "notes", "observations", "data_processing_consent"
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) data[field] = req.body[field];
    }

    const contact = await Contact.create(data);

    // ── Pusher ────────────────────────────────────────────────────────────────
    sendToAccount(accountId, "contact-created", formatContact(contact));
    // ─────────────────────────────────────────────────────────────────────────

    res.status(201).json(formatContact(contact));

  } catch (error) {
    console.error("CREATE MANUAL CONTACT ERROR:", error);
    res.status(500).json({ message: "Error al crear contacto" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Editar campos de un contacto
// Evento: "contact-updated"  →  contacto completo actualizado
// ─────────────────────────────────────────────────────────────────────────────
exports.updateContact = async (req, res) => {
  try {
    const { id }     = req.params;
    const accountId  = req.user.account_id;
    const updates    = req.body;

    if (!id || id === "null" || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID de contacto inválido" });
    }

    const contact = await Contact.findOne({ _id: id, account_id: accountId, is_deleted: false });
    if (!contact) {
      return res.status(404).json({ message: "Contacto no encontrado" });
    }

    const allowedStatus = ["new", "contacted", "qualified", "lost"];
    if (updates.status && !allowedStatus.includes(updates.status)) {
      return res.status(400).json({ message: "Estado inválido" });
    }

    const allowedFields = [
      "name", "last_name", "email", "phone", "birth_date",
      "company", "website", "company_phone", "phone_ext", "position",
      "city", "country", "state", "postal_code", "address", "job_title",
      "privacy", "notes", "observations", "data_processing_consent",
      "status", "completed", "variables"
    ];

    const safeUpdates = {};
    for (const field of allowedFields) {
      if (updates[field] !== undefined) safeUpdates[field] = updates[field];
    }

    delete safeUpdates.account_id;
    delete safeUpdates.source;
    delete safeUpdates.chatbot_id;
    delete safeUpdates.session_id;
    delete safeUpdates.is_deleted;

    const updated = await Contact.findOneAndUpdate(
      { _id: id, account_id: accountId, is_deleted: false },
      { $set: safeUpdates },
      { returnDocument: "after", runValidators: true }
    );

    // ── Pusher ────────────────────────────────────────────────────────────────
    sendToAccount(accountId, "contact-updated", formatContact(updated));
    // ─────────────────────────────────────────────────────────────────────────

    return res.json(formatContact(updated));

  } catch (error) {
    console.error("UPDATE CONTACT ERROR:", error);
    return res.status(500).json({ message: "Error al actualizar contacto" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Listar contactos (solo lectura, sin evento Pusher)
// ─────────────────────────────────────────────────────────────────────────────
exports.getContacts = async (req, res) => {
  try {
    const accountId        = req.user.account_id;
    const { source, status, search } = req.query;

    const filter = {
      account_id: new mongoose.Types.ObjectId(accountId),
      is_deleted: false
    };

    if (status) filter.status = status;

    if (source === "manual") {
      filter.source = "manual";
    }

    if (source === "chatbot") {
      filter.$or = [{ source: "chatbot" }, { source: { $exists: false } }];
    }

    if (search) {
      const searchFilter = [
        { name:  { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } }
      ];

      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: searchFilter }];
        delete filter.$or;
      } else {
        filter.$or = searchFilter;
      }
    }

    const contacts = await Contact.aggregate([
      { $match: filter },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: "conversationsessions",
          localField: "session_id",
          foreignField: "_id",
          as: "conversation"
        }
      },
      { $unwind: { path: "$conversation", preserveNullAndEmptyArrays: true } },
      { $addFields: { conversation_history: "$conversation.history" } },
      { $project: { conversation: 0 } }
    ]);

    const normalized = contacts.map(formatContact);

    const baseCountFilter = { account_id: accountId, is_deleted: false };

    const [total, total_manual, total_chatbot] = await Promise.all([
      Contact.countDocuments(baseCountFilter),
      Contact.countDocuments({ ...baseCountFilter, source: "manual" }),
      Contact.countDocuments({
        ...baseCountFilter,
        $or: [{ source: "chatbot" }, { source: { $exists: false } }]
      })
    ]);

    res.json({ total, total_manual, total_chatbot, contacts: normalized });

  } catch (error) {
    console.error("GET CONTACTS ERROR:", error);
    res.status(500).json({ message: "Error al obtener contactos" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Eliminar contacto (soft delete)
// Evento: "contact-deleted"  →  { id }
// ─────────────────────────────────────────────────────────────────────────────
exports.deleteContact = async (req, res) => {
  try {
    const { id }    = req.params;
    const accountId = req.user.account_id;

    const contact = await Contact.findOne({
      _id: id,
      account_id: accountId,
      is_deleted: false
    });

    if (!contact) {
      return res.status(404).json({ message: "Contacto no encontrado" });
    }

    contact.is_deleted = true;
    await contact.save();

    await ConversationSession.updateOne(
      { _id: contact.session_id, account_id: accountId },
      { $set: { is_deleted: true } }
    );

    // ── Pusher ────────────────────────────────────────────────────────────────
    sendToAccount(accountId, "contact-deleted", { id: contact._id });
    // ─────────────────────────────────────────────────────────────────────────

    return res.json({
      message: "Contacto y conversación eliminados correctamente",
      contact: formatContact(contact)
    });

  } catch (error) {
    console.error("DELETE CONTACT ERROR:", error);
    res.status(500).json({ message: "Error al eliminar contacto" });
  }
};




//Esta variables ya no se usan 
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