const FlowNode = require("../models/FlowNode");

exports.getNextOrder = async (flow_id, account_id, session) => {
  const last = await FlowNode.findOne(
    { flow_id, account_id },
    { order: 1 },
    { sort: { order: -1 }, session }
  );

  return last ? last.order + 1 : 0;
};

exports.reorderFlowNodes = async (flow_id, account_id, session) => {
  const nodes = await FlowNode.find(
    { flow_id, account_id },
    { _id: 1 },
    { session }
  ).sort({ order: 1 });

  if (!nodes.length) return;

  await FlowNode.bulkWrite(
    nodes.map((n, i) => ({
      updateOne: {
        filter: { _id: n._id },
        update: { $set: { order: i, is_draft: true } }
      }
    })),
    { session }
  );
};
