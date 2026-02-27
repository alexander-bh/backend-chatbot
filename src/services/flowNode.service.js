const mongoose = require("mongoose");
const Flow = require("../models/Flow");
const FlowNode = require("../models/FlowNode");
const Chatbot = require("../models/Chatbot");
const withTransactionRetry = require("../utils/withTransactionRetry");

// services/flowNode.service.js
exports.getNodesByFlow = async (flowId, user) => {

  if (!mongoose.Types.ObjectId.isValid(flowId)) {
    throw new Error("flowId inválido");
  }

  const flow = await Flow.findById(flowId);

  if (!flow) {
    throw new Error("Flow no encontrado");
  }

  /* ───────── TEMPLATE GLOBAL ───────── */
  if (flow.is_template === true) {
    if (user.role !== "ADMIN") {
      throw new Error("Solo ADMIN puede acceder al diálogo global");
    }

    return FlowNode.find({
      flow_id: flow._id
    }).sort({ order: 1 });
  }

  /* ───────── FLOW NORMAL ───────── */
  if (
    user.role !== "ADMIN" &&
    String(flow.account_id) !== String(user.account_id)
  ) {
    throw new Error("Flow no autorizado");
  }

  return FlowNode.find({
    flow_id: flow._id
  }).sort({ order: 1 });
};

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
    name:`Flujo de chatbot: ${name}`,
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