const mongoose = require("mongoose");
const Contact = require("../models/Contact");
const Chatbot = require("../models/Chatbot");
const ConversationSession = require("../models/ConversationSession");
const formatContact = require("../helper/formatContact");
const { sendToAccount } = require("../services/pusher.service");

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

    if (variables) updateData.variables = variables;
    if (visitor_id) updateData.visitor_id = visitor_id;
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
    const { status } = req.query;
    const accountId = req.user.account_id;

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
    const { id } = req.params;
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

    const isAdmin = req.user.role === "ADMIN";
    const sameAccount = contact.account_id?.toString() === req.user.account_id?.toString();

    if (contact.is_template && !isAdmin) {
      return res.status(403).json({ message: "Solo ADMIN puede modificar plantillas" });
    }

    if (!contact.is_template && !sameAccount && !isAdmin) {
      return res.status(403).json({ message: "Sin permisos para modificar este contacto" });
    }

    contact.status = status;
    contact.status_changed_at = new Date();

    if (!["lost", "discarded"].includes(status)) {
      contact.lost_limit_at = null;
      contact.discarded_limit_at = null;
      contact.status_changed_at = null;
    }

    if (status === "lost") contact.completed = false;
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
      id: contact._id,
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

    const isAdmin = req.user.role === "ADMIN";
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

    if (lost_limit_at !== undefined) contact.lost_limit_at = lost_limit_at ? new Date(lost_limit_at) : null;
    if (discarded_limit_at !== undefined) contact.discarded_limit_at = discarded_limit_at ? new Date(discarded_limit_at) : null;

    if (contact.status === "discarded") {
      if (discarded_reason !== undefined) contact.discarded_reason = discarded_reason || null;
      if (discarded_notes !== undefined) contact.discarded_notes = discarded_notes?.trim() || null;
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
    const { id } = req.params;
    const accountId = req.user.account_id;
    const updates = req.body;

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
    const accountId = req.user.account_id;
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
        { name: { $regex: search, $options: "i" } },
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
      { $project: { conversation: 0 } },
      // ── JOIN con chatbots ──────────────────────────────────────────────────
      {
        $lookup: {
          from: "chatbots",
          localField: "chatbot_id",
          foreignField: "_id",
          as: "chatbot",
          pipeline: [{ $project: { name: 1, _id: 0 } }]
        }
      },
      { $unwind: { path: "$chatbot", preserveNullAndEmptyArrays: true } },
      { $addFields: { chatbot_name: { $ifNull: ["$chatbot.name", null] } } },
      { $project: { chatbot: 0 } }
      // ───────────────────────────────────────────────────────────────────────
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
    const { id } = req.params;
    const accountId = req.user.account_id;

    const contact = await Contact.findOne({
      _id: id,
      account_id: accountId,
      is_deleted: false
    });

    if (!contact) {
      return res.status(404).json({ message: "Contacto no encontrado" });
    }

    await Contact.deleteOne({ _id: contact._id });

    // ── Eliminar TODAS las sesiones vinculadas al contacto ─────────────────
    const { deletedCount } = await ConversationSession.deleteMany({
      account_id: accountId,
      $or: [
        { _id: contact.session_id },   // sesión original
        { contact_id: contact._id }    // sesiones posteriores
      ]
    });

    sendToAccount(accountId, "contact-deleted", { id: contact._id });

    return res.json({
      message: "Contacto y conversaciones eliminados correctamente",
      contact: formatContact(contact)
    });

  } catch (error) {
    console.error("DELETE CONTACT ERROR:", error);
    res.status(500).json({ message: "Error al eliminar contacto" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Buscar contactos con filtros avanzados
// GET /contacts/search?q=angel&status=new&source=chatbot&chatbot_id=...
//     &completed=true&lead_score_min=50&lead_score_max=100
//     &date_from=2026-01-01&date_to=2026-04-30&page=1&limit=20
// ─────────────────────────────────────────────────────────────────────────────
exports.searchContacts = async (req, res) => {
  try {
    const accountId = req.user.account_id;

    const {
      q,
      status,
      source,
      chatbot_id,
      completed,
      completed_goal,
      lead_score_min,
      lead_score_max,
      device,
      consent,
      date_from,
      date_to,
      page = 1,
      limit = 20,
      sort_by = "createdAt",
      sort_order = "desc"
    } = req.query;

    const filter = {
      account_id: new mongoose.Types.ObjectId(accountId),
      is_deleted: false
    };

    if (status) filter.status = status;
    if (source) filter.source = source;
    if (device) filter.device = device;
    if (consent) filter.data_processing_consent = consent;

    if (chatbot_id && mongoose.Types.ObjectId.isValid(chatbot_id)) {
      filter.chatbot_id = new mongoose.Types.ObjectId(chatbot_id);
    }

    if (completed !== undefined) filter.completed = completed === "true";
    if (completed_goal !== undefined) filter.completed_goal = completed_goal === "true";

    if (lead_score_min !== undefined || lead_score_max !== undefined) {
      filter.lead_score = {};
      if (lead_score_min !== undefined) filter.lead_score.$gte = Number(lead_score_min);
      if (lead_score_max !== undefined) filter.lead_score.$lte = Number(lead_score_max);
    }

    if (date_from || date_to) {
      filter.createdAt = {};
      if (date_from) filter.createdAt.$gte = new Date(date_from);
      if (date_to) {
        const end = new Date(date_to);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    if (q && q.trim()) {
      const escaped = q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = { $regex: escaped, $options: "i" };

      const searchConditions = [
        { name: regex },
        { last_name: regex },
        { email: regex },
        { phone: regex },
        { company: regex },
        { origin_url: regex }
      ];

      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: searchConditions }];
        delete filter.$or;
      } else {
        filter.$or = searchConditions;
      }
    }

    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip     = (pageNum - 1) * limitNum;

    const allowedSorts = { createdAt: 1, lead_score: 1, name: 1 };
    const sortField = allowedSorts[sort_by] !== undefined ? sort_by : "createdAt";
    const sortDir   = sort_order === "asc" ? 1 : -1;

    // ── Aggregate para incluir chatbot_name ────────────────────────────────────
    const pipeline = [
      { $match: filter },
      {
        $lookup: {
          from: "chatbots",
          localField: "chatbot_id",
          foreignField: "_id",
          as: "chatbot",
          pipeline: [{ $project: { name: 1, _id: 0 } }]
        }
      },
      { $unwind: { path: "$chatbot", preserveNullAndEmptyArrays: true } },
      { $addFields: { chatbot_name: { $ifNull: ["$chatbot.name", null] } } },
      { $project: { chatbot: 0 } },
      { $sort: { [sortField]: sortDir } },
      {
        $facet: {
          contacts:  [{ $skip: skip }, { $limit: limitNum }],
          totalDocs: [{ $count: "count" }]
        }
      }
    ];
    // ─────────────────────────────────────────────────────────────────────────

    const [result] = await Contact.aggregate(pipeline);

    const contacts = result.contacts   || [];
    const total    = result.totalDocs[0]?.count || 0;

    return res.json({
      total,
      page:        pageNum,
      limit:       limitNum,
      total_pages: Math.ceil(total / limitNum),
      contacts:    contacts.map(formatContact)
    });

  } catch (error) {
    console.error("SEARCH CONTACTS ERROR:", error);
    return res.status(500).json({ message: "Error al buscar contactos" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Buscar contactos por nombre de chatbot
// GET /contacts/by-chatbot-name?name=mi%20chatbot&page=1&limit=20
// ─────────────────────────────────────────────────────────────────────────────
exports.getContactsByChatbotName = async (req, res) => {
  try {
    const accountId = req.user.account_id;
    const {
      name,
      page = 1,
      limit = 20,
      status,
      sort_by = "createdAt",
      sort_order = "desc"
    } = req.query;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "El parámetro 'name' es requerido" });
    }

    // ── Paso 1: Buscar chatbots que coincidan con el nombre ───────────────────
    const chatbots = await mongoose.model("Chatbot").find({
      account_id: new mongoose.Types.ObjectId(accountId),
      name: { $regex: name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" }
    }).select("_id name").lean();

    if (!chatbots.length) {
      return res.json({
        total: 0,
        page: parseInt(page),
        limit: parseInt(limit),
        total_pages: 0,
        chatbots_found: [],
        contacts: []
      });
    }

    const chatbotIds = chatbots.map(c => c._id);

    // ── Paso 2: Filtro base de contactos ─────────────────────────────────────
    const filter = {
      account_id: new mongoose.Types.ObjectId(accountId),
      chatbot_id: { $in: chatbotIds },
      is_deleted: false
    };

    if (status) filter.status = status;

    // ── Paginación y ordenamiento ─────────────────────────────────────────────
    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip     = (pageNum - 1) * limitNum;

    const allowedSorts = { createdAt: 1, lead_score: 1, name: 1 };
    const sortField = allowedSorts[sort_by] !== undefined ? sort_by : "createdAt";
    const sortDir   = sort_order === "asc" ? 1 : -1;

    // ── Paso 3: Buscar contactos + incluir nombre del chatbot ─────────────────
    const pipeline = [
      { $match: filter },
      {
        $lookup: {
          from: "chatbots",
          localField: "chatbot_id",
          foreignField: "_id",
          as: "chatbot",
          pipeline: [{ $project: { name: 1, _id: 1 } }] // solo trae lo necesario
        }
      },
      { $unwind: { path: "$chatbot", preserveNullAndEmptyArrays: true } },
      { $addFields: { chatbot_name: { $ifNull: ["$chatbot.name", null] } } },
      { $project: { chatbot: 0 } },
      { $sort: { [sortField]: sortDir } },
      {
        $facet: {
          contacts: [{ $skip: skip }, { $limit: limitNum }],
          total:    [{ $count: "count" }]
        }
      }
    ];

    const [result] = await Contact.aggregate(pipeline);

    const contacts = result.contacts || [];
    const total    = result.total[0]?.count || 0;

    return res.json({
      total,
      page:          pageNum,
      limit:         limitNum,
      total_pages:   Math.ceil(total / limitNum),
      chatbots_found: chatbots.map(c => ({ id: c._id, name: c.name })), // qué chatbots matchearon
      contacts:      contacts.map(formatContact)
    });

  } catch (error) {
    console.error("GET CONTACTS BY CHATBOT NAME ERROR:", error);
    return res.status(500).json({ message: "Error al buscar contactos por chatbot" });
  }
};

// ═══════════════════════════════════════════════════════════
// OBTENER TODOS LOS DOMINIOS DE LOS CHATBOTS
// GET /chatbots/domains
// ═══════════════════════════════════════════════════════════
exports.getAllDomains = async (req, res) => {
  try {
    if (!req.user?.account_id) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const chatbots = await Chatbot.find({
      account_id: req.user.account_id
    })
      .select("allowed_domains")
      .lean();

    // Aplanar y deduplicar dominios de todos los chatbots
    const allDomains = chatbots.flatMap(bot => bot.allowed_domains || []);
    const uniqueDomains = [...new Set(allDomains.map(d => d.trim().toLowerCase()))].filter(Boolean);

    return res.json({
      total: uniqueDomains.length,
      domains: uniqueDomains
    });

  } catch (error) {
    console.error("GET ALL DOMAINS ERROR:", error);
    return res.status(500).json({ message: "Error al obtener dominios" });
  }
};