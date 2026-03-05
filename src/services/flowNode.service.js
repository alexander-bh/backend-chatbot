const mongoose = require("mongoose");
const Flow = require("../models/Flow");
const FlowNode = require("../models/FlowNode");
const Chatbot = require("../models/Chatbot");

// services/flowNode.service.js
exports.getNodesByFlow = async (flowId, user) => {

  // 🛑 ADMIN nunca recibe nodos
  if (user?.role === "ADMIN") {
    return [];
  }

  // 🛑 flowId null | undefined | vacío
  if (!flowId) {
    return [];
  }

  // 🛑 validar ObjectId
  if (!mongoose.Types.ObjectId.isValid(flowId)) {
    return [];
  }

  const flow = await Flow.findById(flowId).lean();

  // 🛑 flow no existe
  if (!flow) {
    return [];
  }

  /* ───────── TEMPLATE GLOBAL ───────── */
  if (flow.is_template === true) {
    return [];
  }

  /* ───────── VALIDAR CUENTA ───────── */
  if (!flow.account_id || String(flow.account_id) !== String(user?.account_id)) {
    return [];
  }

  const nodes = await FlowNode.find({
    flow_id: flow._id
  })
  .sort({ order: 1 })
  .lean();

  return nodes || [];
};

// services/cloneFlow + Node 
exports.cloneTemplateToFlow = async (chatbot_id, user_id, session,name) => {

  if (!mongoose.Types.ObjectId.isValid(chatbot_id)) {
    throw new Error("chatbot_id inválido");
  }

  /* ================= CHATBOT ================= */
  const chatbot = await Chatbot.findById(chatbot_id).session(session);

  if (!chatbot) {
    throw new Error("Chatbot no encontrado");
  }

  const account_id = chatbot.account_id;

  /* ================= TEMPLATE ================= */
  const templateFlow = await Flow.findOne({
    is_template: true,
    account_id: null,
    status: "published"
  }).session(session);

  if (!templateFlow) {
    throw new Error("No existe diálogo global publicado");
  }

  /* ================= NUEVO FLOW ================= */
  const [newFlow] = await Flow.create([{
    name:`Flujo del chatbot: ${name}`,
    account_id,
    chatbot_id,
    is_template: false,
    base_flow_id: templateFlow._id,
    status: "draft",
    lock: null,
    version: 1
  }], { session });

  const flowId = newFlow._id;

  /* ================= NODOS ================= */
  const templateNodes = await FlowNode.find({
    flow_id: templateFlow._id
  }).session(session);

  if (!templateNodes.length) {
    throw new Error("Template sin nodos");
  }

  const idMap = new Map();
  templateNodes.forEach(n => {
    idMap.set(String(n._id), new mongoose.Types.ObjectId());
  });

  const clonedNodes = templateNodes.map(node => {
    const clone = {
      _id: idMap.get(String(node._id)),
      flow_id: flowId,
      account_id,
      branch_id: node.branch_id,
      order: node.order,
      node_type: node.node_type,
      content: node.content,
      typing_time: node.typing_time,
      end_conversation: node.end_conversation,
      meta: node.meta,
      is_draft: true
    };

    if (node.next_node_id) {
      clone.next_node_id = idMap.get(String(node.next_node_id));
    }

    if (node.options?.length) {
      clone.options = node.options.map(opt => ({
        ...opt.toObject(),
        next_node_id: opt.next_node_id
          ? idMap.get(String(opt.next_node_id))
          : null
      }));
    }

    if (node.variable_key) {
      clone.variable_key = node.variable_key;
      clone.validation = node.validation;
      clone.crm_field_key = node.crm_field_key;
    }

    return clone;
  });

  await FlowNode.insertMany(clonedNodes, { session });

  if (templateFlow.start_node_id) {
    newFlow.start_node_id =
      idMap.get(String(templateFlow.start_node_id));
  }

  await newFlow.save({ session });

  return newFlow;
};

// sercice/flowFallback
exports.createFallbackFlow = async ({
  chatbot_id,
  account_id,
  session,
  name
}) => {

  const [flow] = await Flow.create([{
    account_id,
    chatbot_id,
    name: `Diálogo del chatbot - ${name}`,
    status: "draft",
    version: 1,
    is_template: false
  }], { session });

  const [node] = await FlowNode.create([{
    flow_id: flow._id,
    account_id,
    order: 0,
    node_type: "text",
    content: "Hola 👋",
    typing_time: 2,
    end_conversation: false
  }], { session });

  flow.start_node_id = node._id;
  await flow.save({ session });

  return flow;
};

exports.ensureFlowExists = async ({
  flowId,
  chatbot_id,
  account_id,
  user_role,
  session
}) => {

  let flow = null;
  const isAdmin = user_role === "ADMIN";

  // 1️⃣ Buscar por ID
  if (flowId && mongoose.Types.ObjectId.isValid(flowId)) {
    flow = await Flow.findById(flowId).session(session);
    if (flow) return flow;
  }

  // 2️⃣ Admin → buscar template global
  if (isAdmin) {
    flow = await Flow.findOne({
      is_template: true,
      chatbot_id: null,
      account_id: null
    }).session(session);

    if (flow) return flow;
  }

  // ✅ 3️⃣ Cliente → buscar si ya existe
  if (!isAdmin && chatbot_id) {
    flow = await Flow.findOne({
      chatbot_id,
      account_id,
      is_template: false
    }).session(session);

    if (flow) return flow;
  }

  // 4️⃣ Crear solo si realmente no existe
  let flowName = "Diálogo global";

  if (!isAdmin) {
    const chatbot = await Chatbot.findOne({
      _id: chatbot_id,
      account_id
    }).session(session);

    if (!chatbot) {
      throw new Error("Chatbot no encontrado");
    }

    flowName = `Diálogo del chatbot - ${chatbot.name}`;
  }

  const [newFlow] = await Flow.create([{
    chatbot_id: isAdmin ? null : chatbot_id,
    account_id: isAdmin ? null : account_id,
    name: flowName,
    status: "draft",
    version: 1,
    is_template: isAdmin,
    lock: null
  }], { session });

  return newFlow;
};