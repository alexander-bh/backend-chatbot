// upsertContactFromSession.service.js

const Contact = require("../models/Contact");
const FlowNode = require("../models/FlowNode");

module.exports = async function upsertContactFromSession(session) {
  try {

    /* ================= LOAD FLOW NODES ================= */

    const nodes = await FlowNode.find({
      flow_id: session.flow_id,
      account_id: session.account_id
    }).lean();

    const nodeMap = new Map(nodes.map(n => [String(n._id), n]));

    /* ================= BUILD CONVERSATION ================= */

    const conversation = [];

    for (const step of session.history || []) {

      const node = nodeMap.get(String(step.node_id));
      if (!node) continue;

      conversation.push({
        node_id: step.node_id,
        type: node.node_type,
        question: step.question || node.content,
        answer: step.answer || null,
        variable: node.variable_key || null,
        timestamp: step.timestamp || new Date()
      });
    }

    /* ================= UPSERT CONTACT ================= */

    await Contact.findOneAndUpdate(
      {
        session_id: session._id
      },
      {
        account_id: session.account_id,
        chatbot_id: session.chatbot_id,
        session_id: session._id,
        variables: session.variables,
        origin_url: session.origin_url,
        conversation,
        completed: session.is_completed
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    );

  } catch (error) {
    console.error("upsertContactFromSession error:", error);
  }
};