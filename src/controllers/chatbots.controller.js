const mongoose = require("mongoose");
const crypto = require("crypto");
const Chatbot = require("../models/Chatbot");
const Flow = require("../models/Flow");
const FlowNode = require("../models/FlowNode");
const Contact = require("../models/Contact");
const Avatar = require("../models/Avatar");
const {
  getBaseName,
  generateCopyName
} = require("../utils/chatbotName.helper");
const { cloneTemplateToFlow } = require("../services/flowNode.service");
const { createFallbackFlow } = require("../services/flowNode.service");
const formatDateAMPM = require("../utils/formatDate");

// ═══════════════════════════════════════════════════════════
// CREAR CHATBOT (CLIENT)
// ═══════════════════════════════════════════════════════════
exports.createChatbot = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();
    const {
      name,
      welcome_message,
      welcome_delay,
      show_welcome_on_mobile
    } = req.body;

    if (!req.user?.account_id) {
      throw new Error("Usuario no autenticado");
    }

    if (!name || typeof name !== "string" || !name.trim()) {
      throw new Error("Nombre inválido");
    }

    /* ───────── AVATAR DEFAULT LOGIC ───────── */

    const defaultAvatar = await Avatar.findOne({
      type: "SYSTEM",
      is_default: true
    }).session(session);

    let avatarToUse = null;

    if (defaultAvatar) {
      avatarToUse = defaultAvatar.url;
    } else if (process.env.DEFAULT_CHATBOT_AVATAR) {
      avatarToUse = process.env.DEFAULT_CHATBOT_AVATAR;
    } else {
      const firstSystemAvatar = await Avatar.findOne({
        type: "SYSTEM"
      }).session(session);

      avatarToUse = firstSystemAvatar?.url || null;
    }

    /* ───────── CREAR CHATBOT ───────── */

    const chatbot = await Chatbot.create([{
      account_id: req.user.account_id,
      public_id: crypto.randomUUID(),
      name: name.trim(),
      welcome_message:
        typeof welcome_message === "string" && welcome_message.trim()
          ? welcome_message
          : "Hola 👋 ¿en qué puedo ayudarte?",
      welcome_delay: welcome_delay ?? 2,
      show_welcome_on_mobile: show_welcome_on_mobile ?? true,
      status: "active",
      is_enabled: true,
      avatar: avatarToUse // 🔥 AQUÍ
    }], { session });

    const chatbotDoc = chatbot[0];

    /* ───────── FLOW ───────── */

    let flow;
    let flowName = name.trim();

    try {
      flow = await cloneTemplateToFlow(
        chatbotDoc._id,
        req.user._id,
        session,
        flowName
      );
    } catch (err) {
      console.warn("⚠️ No hay flow global, creando flow básico");
      flow = await createFallbackFlow({
        chatbot_id: chatbotDoc._id,
        account_id: req.user.account_id,
        session,
        name: flowName
      });
    }

    //verificar si la cuenta ya tiene contactos del sistema
    const existingSystemContact = await Contact.findOne({
      account_id: req.user.account_id,
      source: "system",
      is_deleted: { $ne: true }
    }).session(session);

    if (existingSystemContact) {
      console.log("ℹ️ La cuenta ya tiene contactos del sistema, no se duplican");
    } else {

      const templateContacts = await Contact.find({
        is_template: true,
        is_deleted: { $ne: true }
      }).session(session);

      if (!templateContacts.length) {
        console.log("ℹ️ No existen contactos plantilla");
      } else {

        const contactsToInsert = templateContacts.map(template => ({
          account_id: req.user.account_id,
          chatbot_id: chatbotDoc._id,
          source: "system",
          name: template.name,
          email: template.email,
          phone: template.phone,
          company: template.company,
          website: template.website,
          city: template.city,
          country: template.country,
          address: template.address,
          position: template.position,
          internal_note: template.internal_note,
          status: "new",
          completed: false,
          variables: {},
          is_deleted: false
        }));

        await Contact.insertMany(contactsToInsert, { session });
      }
    }
    
    await session.commitTransaction();

    return res.status(201).json({
      chatbot: chatbotDoc,
      flow,
      start_node_id: flow.start_node_id
    });

  } catch (error) {
    await session.abortTransaction();
    console.error("CREATE CHATBOT ERROR:", error);

    return res.status(500).json({
      message: error.message
    });
  } finally {
    session.endSession();
  }
};

// ═══════════════════════════════════════════════════════════
// LISTAR CHATBOTS
// ═══════════════════════════════════════════════════════════
exports.listChatbots = async (req, res) => {
  try {
    if (!req.user?.account_id) {
      return res.status(401).json({
        success: false,
        message: "Usuario no autenticado"
      });
    }

    const account_id = req.user.account_id;

    /* ================= CHATBOTS ================= */

    const chatbots = await Chatbot.find({ account_id })
      .select("_id public_id name status is_enabled avatar created_at")
      .sort({ created_at: -1 })
      .lean();

    /* ================= FLOWS (solo id y name) ================= */

    const flows = await Flow.find({
      account_id,
      is_template: false
    })
      .select("_id chatbot_id name")
      .lean();

    /* ================= AGRUPAR FLOWS POR CHATBOT ================= */

    const flowsByChatbot = {};

    flows.forEach(flow => {
      const key = String(flow.chatbot_id);

      if (!flowsByChatbot[key]) {
        flowsByChatbot[key] = [];
      }

      flowsByChatbot[key].push({
        _id: flow._id,
        name: flow.name
      });
    });

    /* ================= FORMATEAR RESPUESTA ================= */

    const formatted = chatbots.map(bot => ({
      _id: bot._id,
      public_id: bot.public_id,
      name: bot.name,
      status: bot.status,
      is_enabled: bot.is_enabled,
      avatar: bot.avatar,
      created_at: bot.created_at
        ? formatDateAMPM(bot.created_at)
        : null,
      flows: flowsByChatbot[String(bot._id)] || []
    }));

    return res.json(formatted);

  } catch (error) {
    console.error("LIST CHATBOTS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Error al listar chatbots"
    });
  }
};

// ═══════════════════════════════════════════════════════════
// OBTENER CHATBOT POR ID
// ═══════════════════════════════════════════════════════════
exports.getChatbotById = async (req, res) => {
  try {

    if (!req.user?.account_id) {
      return res.status(401).json({
        success: false,
        message: "Usuario no autenticado"
      });
    }

    const chatbot = await Chatbot.findOne({
      _id: req.params.id,
      account_id: req.user.account_id
    })
      .select("-install_token -verified_domains")
      .lean();

    if (!chatbot) {
      return res.status(404).json({
        success: false,
        message: "Chatbot no encontrado"
      });
    }

    const flows = await Flow.find({
      chatbot_id: chatbot._id,
      account_id: req.user.account_id
    })
      .sort({ createdAt: 1 }) // 👈 corregido (era created_at)
      .lean();

    return res.json({
      success: true,
      chatbot,
      flows
    });

  } catch (error) {
    console.error("GET CHATBOT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Error al obtener chatbot"
    });
  }
};


// ═══════════════════════════════════════════════════════════
// ACTUALIZAR CHATBOT
// ═══════════════════════════════════════════════════════════
exports.updateChatbot = async (req, res) => {

  const session = await mongoose.startSession();

  try {

    await session.startTransaction();

    if (!req.user?.account_id) {
      await session.abortTransaction();
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const chatbot = await Chatbot.findOne({
      _id: req.params.id,
      account_id: req.user.account_id
    }).session(session);

    if (!chatbot) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    const {
      name,
      welcome_message,
      welcome_delay,
      show_welcome_on_mobile,
      primary_color,
      secondary_color,
      launcher_text,
      input_placeholder,
      position,
      show_branding,
      is_enabled,
      status,
      avatar
    } = req.body;

    /* ───────── ACTUALIZAR CAMPOS ───────── */

    if (name !== undefined) {
      if (!name.trim() || name.length > 60) {
        await session.abortTransaction();
        return res.status(400).json({ message: "Nombre inválido" });
      }
      chatbot.name = name.trim();
    }

    if (welcome_message !== undefined) chatbot.welcome_message = welcome_message;

    if (welcome_delay !== undefined) {
      if (welcome_delay < 0 || welcome_delay > 10) {
        await session.abortTransaction();
        return res.status(400).json({ message: "welcome_delay inválido" });
      }
      chatbot.welcome_delay = welcome_delay;
    }

    if (show_welcome_on_mobile !== undefined) chatbot.show_welcome_on_mobile = show_welcome_on_mobile;
    if (primary_color !== undefined) chatbot.primary_color = primary_color;
    if (secondary_color !== undefined) chatbot.secondary_color = secondary_color;
    if (launcher_text !== undefined) chatbot.launcher_text = launcher_text;
    if (input_placeholder !== undefined) chatbot.input_placeholder = input_placeholder;
    if (position !== undefined) chatbot.position = position;
    if (show_branding !== undefined) chatbot.show_branding = show_branding;
    if (is_enabled !== undefined) chatbot.is_enabled = is_enabled;
    if (status !== undefined) chatbot.status = status;

    /* ───────── AVATAR ───────── */

    if (req.file) {

      const avatarUrl = req.file.path;
      chatbot.avatar = avatarUrl;

      if (!Array.isArray(chatbot.uploaded_avatars)) {
        chatbot.uploaded_avatars = [];
      }

      chatbot.uploaded_avatars.push({
        id: crypto.randomUUID(),
        label: `Avatar ${chatbot.uploaded_avatars.length + 1}`,
        url: avatarUrl,
        created_at: new Date()
      });

    }

    if (avatar && !req.file) {

      const systemAvatar = await Avatar.findOne({
        url: avatar,
        type: "SYSTEM"
      }).session(session);

      const isUploadedAvatar =
        chatbot.uploaded_avatars?.some(a => a.url === avatar);

      if (!systemAvatar && !isUploadedAvatar) {
        try {
          new URL(avatar);
        } catch {
          await session.abortTransaction();
          return res.status(400).json({
            message: "URL de avatar inválida"
          });
        }
      }

      chatbot.avatar = avatar;
    }

    if (req.body.allowed_domains !== undefined) {

      if (!Array.isArray(req.body.allowed_domains)) {
        await session.abortTransaction();
        return res.status(400).json({
          message: "allowed_domains debe ser un arreglo"
        });
      }

      chatbot.allowed_domains = req.body.allowed_domains
        .map(d => d.trim().toLowerCase())
        .filter(Boolean);
    }

    await chatbot.save({ session });

    /* ───────── FLOW ───────── */

    let flow = await Flow.findOne({
      chatbot_id: chatbot._id,
      account_id: req.user.account_id,
      is_template: false
    }).session(session);

    // 🔥 Si no existe flow → crear fallback
    if (!flow) {

      console.warn("⚠️ Chatbot sin flow, creando fallback");

      flow = await createFallbackFlow({
        chatbot_id: chatbot._id,
        account_id: req.user.account_id,
        session,
        name: chatbot.name
      });

    }
    else if (name !== undefined) {

      flow.name = `Diálogo del chatbot - ${chatbot.name}`;
      await flow.save({ session });

    }

    await session.commitTransaction();

    res.json({
      message: "Chatbot actualizado correctamente",
      chatbot
    });

  }
  catch (error) {

    await session.abortTransaction();

    console.error("UPDATE CHATBOT ERROR:", error);

    res.status(500).json({
      message: "Error al actualizar chatbot"
    });

  }
  finally {

    session.endSession();

  }
};

// ═══════════════════════════════════════════════════════════
// ELIMINAR CHATBOT
// ═══════════════════════════════════════════════════════════
exports.deleteChatbot = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!req.user?.account_id) {
      await session.abortTransaction();
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const chatbot = await Chatbot.findOne({
      _id: req.params.id,
      account_id: req.user.account_id
    }).session(session);

    if (!chatbot) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    // ─────────── OBTENER FLOWS ───────────
    const flows = await Flow.find({
      chatbot_id: chatbot._id,
      account_id: req.user.account_id
    }).session(session);

    const flowIds = flows.map(f => f._id);

    // ─────────── ELIMINAR EN CASCADA ───────────
    await FlowNode.deleteMany(
      { flow_id: { $in: flowIds }, account_id: req.user.account_id },
      { session }
    );

    await Flow.deleteMany(
      { chatbot_id: chatbot._id, account_id: req.user.account_id },
      { session }
    );

    await Chatbot.deleteOne({ _id: chatbot._id }, { session });

    await session.commitTransaction();
    res.json({ message: "Chatbot eliminado correctamente" });

  } catch (error) {
    await session.abortTransaction();
    console.error("DELETE CHATBOT ERROR:", error);
    res.status(500).json({ message: "Error al eliminar chatbot" });
  } finally {
    session.endSession();
  }
};

// ═══════════════════════════════════════════════════════════
// DUPLICAR CHATBOT COMPLETO
// ═══════════════════════════════════════════════════════════
exports.duplicateChatbotFull = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    if (!req.user?.account_id) {
      throw new Error("Usuario no autenticado");
    }

    // ─────────── CHATBOT ORIGEN ───────────
    const original = await Chatbot.findOne({
      _id: req.params.id,
      account_id: req.user.account_id
    }).session(session);

    if (!original) {
      throw new Error("Chatbot no encontrado");
    }

    let defaultAvatar = await Avatar.findOne({
      type: "SYSTEM",
      is_default: true
    }).session(session);

    if (!defaultAvatar) {
      defaultAvatar = await Avatar.findOne({
        type: "SYSTEM"
      }).session(session);
    }

    if (!defaultAvatar) {
      throw new Error("No existen avatares del sistema");
    }

    // ─────────── NUEVO CHATBOT ───────────
    const baseName = getBaseName(original.name);
    const newName = await generateCopyName(
      baseName,
      req.user.account_id,
      session
    );

    const newChatbot = await Chatbot.create([{
      account_id: req.user.account_id,
      public_id: crypto.randomUUID(),
      name: newName,
      welcome_message: original.welcome_message,
      welcome_delay: original.welcome_delay,
      show_welcome_on_mobile: original.show_welcome_on_mobile,
      primary_color: original.primary_color,
      secondary_color: original.secondary_color,
      launcher_text: original.launcher_text,
      input_placeholder: original.input_placeholder,
      position: original.position,
      show_branding: original.show_branding,
      status: "active",
      is_enabled: false,
      avatar: defaultAvatar.url,
      uploaded_avatars: []
    }], { session });

    const createdChatbot = newChatbot[0];

    // ─────────── COPIAR FLOWS ───────────
    const originalFlows = await Flow.find({
      chatbot_id: original._id,
      account_id: req.user.account_id
    }).session(session);

    const flowIdMap = new Map();

    for (const flow of originalFlows) {
      const [createdFlow] = await Flow.create([{
        account_id: req.user.account_id,
        chatbot_id: createdChatbot._id,
        name: flow.name,
        status: "draft",
        version: 1,
        start_node_id: null,
        lock: null, // 🔒 IMPORTANTE
        base_flow_id: null,
        published_at: null
      }], { session });

      flowIdMap.set(String(flow._id), createdFlow);
    }

    // ─────────── COPIAR NODES ───────────
    const originalNodes = await FlowNode.find({
      flow_id: { $in: originalFlows.map(f => f._id) },
      account_id: req.user.account_id
    }).session(session);

    const nodeIdMap = new Map();
    const newNodesBulk = [];

    // PASO 1: Crear nodos base (sin relaciones)
    for (const node of originalNodes) {
      const newFlow = flowIdMap.get(String(node.flow_id));

      const newNode = {
        account_id: req.user.account_id,
        flow_id: newFlow._id,
        branch_id: node.branch_id ?? null,
        node_type: node.node_type,
        content: node.content,
        order: node.order ?? 0,
        parent_node_id: null,
        typing_time: node.typing_time ?? 2,
        variable_key: node.variable_key ?? null,
        validation: node.validation ?? null,
        crm_field_key: node.crm_field_key ?? null,
        link_action: node.link_action ?? null,
        options: [],
        policy: [],
        next_node_id: null,
        end_conversation: node.end_conversation ?? false,
        is_draft: true
      };

      newNodesBulk.push(newNode);
    }

    const createdNodes = await FlowNode.insertMany(newNodesBulk, { session });

    // Mapear IDs
    originalNodes.forEach((oldNode, index) => {
      nodeIdMap.set(String(oldNode._id), createdNodes[index]._id);
    });

    // PASO 2: Reconstruir relaciones
    for (let i = 0; i < originalNodes.length; i++) {
      const originalNode = originalNodes[i];
      const createdNode = createdNodes[i];

      let needsUpdate = false;

      // options
      if (originalNode.options?.length) {
        createdNode.options = originalNode.options.map(opt => ({
          ...opt.toObject(),
          next_node_id: opt.next_node_id
            ? nodeIdMap.get(String(opt.next_node_id))
            : null
        }));

        needsUpdate = true;
      }

      if (originalNode.policy?.length) {
        createdNode.policy = originalNode.policy.map(pol => ({
          label: pol.label,
          value: pol.value,
          order: pol.order ?? 0,
          next_node_id: pol.next_node_id
            ? nodeIdMap.get(String(pol.next_node_id))
            : null,
          next_branch_id: pol.next_branch_id ?? null
        }));

        needsUpdate = true;
      }

      if (needsUpdate) {
        await createdNode.save({ session });
      }
    }

    // ─────────── ASIGNAR START NODES ───────────
    for (const flow of originalFlows) {
      if (!flow.start_node_id) continue;

      const newFlow = flowIdMap.get(String(flow._id));
      newFlow.start_node_id =
        nodeIdMap.get(String(flow.start_node_id)) || null;

      await newFlow.save({ session });
    }

    await session.commitTransaction();

    res.status(201).json({
      message: "Chatbot duplicado correctamente",
      chatbot_id: createdChatbot._id
    });

  } catch (error) {
    await session.abortTransaction();
    console.error("DUPLICATE CHATBOT ERROR:", error);
    res.status(500).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

// ═══════════════════════════════════════════════════════════
// OBTENER AVATARS DISPONIBLES
// ═══════════════════════════════════════════════════════════
exports.getAvailableAvatars = async (req, res) => {
  try {
    if (!req.user?.account_id) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const chatbot = await Chatbot.findOne({
      _id: req.params.id,
      account_id: req.user.account_id
    }).lean();

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    const systemAvatars = await Avatar.find({
      type: "SYSTEM"
    }).lean();

    res.json({
      system: systemAvatars,
      uploaded: chatbot.uploaded_avatars || [],
      active: chatbot.avatar
    });

  } catch (error) {
    console.error("GET AVATARS ERROR:", error);
    res.status(500).json({ message: "Error al obtener avatares" });
  }
};

// ═══════════════════════════════════════════════════════════
// ELIMINAR AVATAR SUBIDO
// ═══════════════════════════════════════════════════════════
exports.deleteAvatar = async (req, res) => {
  try {
    if (!req.user?.account_id) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const chatbot = await Chatbot.findOne({
      _id: req.params.id,
      account_id: req.user.account_id
    });

    if (!chatbot) {
      return res.status(404).json({ message: "Chatbot no encontrado" });
    }

    const { avatarUrl } = req.body;

    if (!avatarUrl) {
      return res.status(400).json({ message: "avatarUrl requerido" });
    }

    // 🔥 verificar si es avatar del sistema
    const systemAvatar = await Avatar.findOne({
      url: avatarUrl,
      type: "SYSTEM"
    });

    if (systemAvatar) {
      return res.status(400).json({
        message: "No se puede eliminar un avatar del sistema"
      });
    }

    const before = chatbot.uploaded_avatars?.length || 0;

    chatbot.uploaded_avatars = chatbot.uploaded_avatars.filter(
      a => a.url !== avatarUrl
    );

    if (before === chatbot.uploaded_avatars.length) {
      return res.status(404).json({ message: "Avatar no encontrado" });
    }

    // 🔥 si era el activo
    if (chatbot.avatar === avatarUrl) {
      const fallback = await Avatar.findOne({ type: "SYSTEM" });
      chatbot.avatar =
        process.env.DEFAULT_CHATBOT_AVATAR ||
        fallback?.url ||
        null;
    }

    await chatbot.save();

    res.json({
      message: "Avatar eliminado correctamente",
      avatar: chatbot.avatar,
      uploaded_avatars: chatbot.uploaded_avatars
    });

  } catch (error) {
    console.error("DELETE AVATAR ERROR:", error);
    res.status(500).json({ message: "Error al eliminar avatar" });
  }
};