const FlowNode = require("../models/FlowNode");

exports.reconnectParents = async (
  deletedNode,
  flow_id,
  account_id,
  session
) => {
  if (!deletedNode) return [];

  const nextId = deletedNode.next_node_id || null;
  const reconnections = [];

  const parents = await FlowNode.find(
    {
      flow_id,
      account_id,
      $or: [
        { next_node_id: deletedNode._id },
        { "options.next_node_id": deletedNode._id }
      ]
    },
    null,
    { session }
  );

  for (const parent of parents) {
    let touched = false;

    if (parent.next_node_id?.equals(deletedNode._id)) {
      parent.next_node_id = nextId;
      touched = true;
      reconnections.push({
        from: parent._id,
        to: nextId,
        type: "direct"
      });
    }

    if (parent.node_type === "options" && Array.isArray(parent.options)) {
      parent.options.forEach(opt => {
        if (opt.next_node_id?.equals(deletedNode._id)) {
          opt.next_node_id = nextId;
          touched = true;
          reconnections.push({
            from: parent._id,
            to: nextId,
            type: "option"
          });
        }
      });
    }

    if (touched) {
      parent.is_draft = true;
      await parent.save({ session });
    }
  }

  return reconnections;
};
