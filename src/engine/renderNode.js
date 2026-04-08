const resolveNodeVariables = require("../helper/resolveNodeVariables");

module.exports = function renderNode(node, session_id, context = {}) {

  if (!node) {
    return { session_id, completed: true };
  }

  const resolvedContent = resolveNodeVariables(node.content, context);

  const payload = {
    session_id,
    node_id: node._id ?? null,
    node_type: node.node_type,
    content: resolvedContent || null,
    typing_time: node.typing_time || 0,
    validation: node.validation || null,
    end_conversation: node.end_conversation || false,
    completed: false
  };

  /* ===== OPTIONS ===== */
  if (node.node_type === "options" && Array.isArray(node.options)) {
    payload.options = node.options.map((opt, index) => ({
      index,
      label: opt.label,
      value: opt.value ?? opt.label
    }));
  }

  /* ===== POLICY ===== */
  if (node.node_type === "policy" && Array.isArray(node.policy)) {
    payload.policy = node.policy.map((opt, index) => ({
      index,
      label: opt.label,
      value: opt.value ?? opt.label
    }));
  }

  /* ===== LINK ===== */
  if (node.node_type === "link") {
    payload.link_actions = node.link_actions || [];
  }

  /* ===== MEDIA ===== */
  if (node.node_type === "media") {
    payload.media = Array.isArray(node.media)
      ? node.media.map(m => ({
        type: m.type,
        url: m.url
      }))
      : [];
  }
  /* ===== INPUT TYPES ===== */
  if ([
    "question",
    "email",
    "phone",
    "number"
  ].includes(node.node_type)) {
    payload.input_type = node.node_type;
  }

  return payload;
};