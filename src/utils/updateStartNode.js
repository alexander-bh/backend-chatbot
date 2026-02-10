const FlowNode = require("../models/FlowNode");
const Flow = require("../models/Flow");

module.exports = async function updateStartNode(
  flow_id,
  account_id,
  session = null,
  deletedIds = []
) {

  const baseQuery = {
    flow_id,
    account_id,
    _id: { $nin: deletedIds }
  };

  const rootsQuery = FlowNode.find({
    ...baseQuery,
    parent_node_id: null
  }).sort({ order: 1 });

  if (session) rootsQuery.session(session);

  const roots = await rootsQuery;

  let startNode = null;

  if (roots.length) {
    startNode = roots[0];
  } else {
    const fallback = await FlowNode.findOne(baseQuery)
      .sort({ order: 1 })
      .session(session);

    if (!fallback) {
      await Flow.updateOne(
        { _id: flow_id, account_id },
        { start_node_id: null },
        session ? { session } : undefined
      );
      return;
    }

    fallback.parent_node_id = null;
    await fallback.save({ session });
    startNode = fallback;
  }

  // 🔥 AQUÍ ESTÁ EL FIX REAL
  await FlowNode.updateMany(
    {
      ...baseQuery,
      _id: { $ne: startNode._id },
      parent_node_id: null
    },
    {
      $set: { parent_node_id: startNode._id }
    },
    session ? { session } : undefined
  );

  await Flow.updateOne(
    { _id: flow_id, account_id },
    { start_node_id: startNode._id },
    session ? { session } : undefined
  );
};
