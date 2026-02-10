const FlowNode = require("../models/FlowNode");

exports.reconnectParents = async (
  deletedNode,
  flow_id,
  account_id,
  session,
  cascadeIds = []
) => {

  if (!deletedNode) return [];

  const deletedId = String(deletedNode._id);

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

    // no tocar nodos que se van a borrar
    if (cascadeIds.includes(String(parent._id))) continue;

    let touched = false;

    // cortar next directo
    if (
      parent.next_node_id &&
      String(parent.next_node_id) === deletedId
    ) {
      parent.next_node_id = null;
      touched = true;
    }

    // cortar opciones
    if (Array.isArray(parent.options)) {
      for (const opt of parent.options) {
        if (
          opt.next_node_id &&
          String(opt.next_node_id) === deletedId
        ) {
          opt.next_node_id = null;
          touched = true;
        }
      }
    }

    if (touched) {
      parent.is_draft = true;

      await parent.save({ session });

      reconnections.push({
        from: parent._id,
        removed: deletedNode._id,
        type: "unlink"
      });
    }
  }

  return reconnections;
};
