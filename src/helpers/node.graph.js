const FlowNode = require("../models/FlowNode");

exports.hasOtherParents = async ({
  nodeId,
  flow_id,
  account_id,
  excludeParentId,
  session
}) => {
  const parent = await FlowNode.findOne(
    {
      flow_id,
      account_id,
      _id: { $ne: excludeParentId },
      $or: [
        { next_node_id: nodeId },
        { "options.next_node_id": nodeId }
      ]
    },
    null,
    { session }
  );

  return !!parent;
};

exports.collectSafeCascadeIds = async ({
  startNode,
  account_id,
  session
}) => {

  const ids = new Set();
  const stack = [startNode._id];

  while (stack.length) {

    const id = stack.pop();
    if (ids.has(String(id))) continue;

    ids.add(String(id));

    const node = await FlowNode.findById(id, null, { session });
    if (!node) continue;

    const pushIfSafe = async (childId) => {
      if (!childId) return;

      const shared = await exports.hasOtherParents({
        nodeId: childId,
        flow_id: node.flow_id,
        account_id,
        excludeParentId: node._id,
        session
      });

      if (!shared) stack.push(childId);
    };

    await pushIfSafe(node.next_node_id);

    for (const opt of node.options || []) {
      await pushIfSafe(opt.next_node_id);
    }
  }

  return [...ids];
};
