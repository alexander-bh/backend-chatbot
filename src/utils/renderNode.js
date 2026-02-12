module.exports = function renderNode(node, session_id) {

  const payload = {
    session_id,
    node_id: node._id,
    type: node.node_type,
    content: node.content ?? null,
    typing_time: node.typing_time ?? 0
  };

  if (node.node_type === "options" && Array.isArray(node.options)) {
    payload.options = node.options.map((opt, index) => ({
      index,
      label: opt?.label ?? ""
    }));
  }

  if (node.node_type === "link") {
    payload.link_action = node.link_action ?? null;
  }

  if (
    ["question", "email", "phone", "number", "text_input"]
      .includes(node.node_type)
  ) {
    payload.input_type = node.node_type;
  }

  return payload;
};
