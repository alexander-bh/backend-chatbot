// renderNode
module.exports = function renderNode(node, session_id) {

  const payload = {
    session_id,
    node_id: node._id,
    type: node.node_type,
    content: node.content || null,
    typing_time: node.typing_time || 0,
    validation: node.validation || null,
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

  /* ===== INPUT TYPES ===== */
  if ([
    "question",
    "email",
    "phone",
    "number",
    "text_input"
  ].includes(node.node_type)) {
    payload.input_type = node.node_type;
  }

  return payload;
};