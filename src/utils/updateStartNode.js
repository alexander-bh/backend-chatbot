const FlowNode = require("../models/FlowNode");
const Flow = require("../models/Flow");

module.exports = async function updateStartNode(
  flow_id,
  account_id,
  session = null
) {
  const query = FlowNode.findOne({
    flow_id,
    account_id,
    parent_node_id: null
  }).sort({ order: 1 });

  if (session) query.session(session);

  const firstNode = await query;

  if (!firstNode) return;

  await Flow.updateOne(
    { _id: flow_id, account_id },
    { start_node_id: firstNode._id },
    session ? { session } : undefined
  );
};
