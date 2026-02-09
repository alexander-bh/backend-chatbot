//node.order
const FlowNode = require("../models/FlowNode");

// ─────────────────────────────────────────────
// Obtener siguiente order
// ─────────────────────────────────────────────
exports.getNextOrder = async (flow_id, account_id, session) => {
  const last = await FlowNode.findOne(
    { flow_id, account_id },
    { order: 1 },
    { sort: { order: -1 }, session }
  );

  return last ? last.order + 1 : 0;
};

// ─────────────────────────────────────────────
// Reordenar nodos
// ─────────────────────────────────────────────
exports.reorderFlowNodes = async (
  flow_id,
  account_id,
  session,
  nodes = null
) => {

  // 🔁 Orden manual (drag & drop)
  if (Array.isArray(nodes) && nodes.length) {
    await FlowNode.bulkWrite(
      nodes.map((id, index) => ({
        updateOne: {
          filter: { _id: id, flow_id, account_id },
          update: { $set: { order: index, is_draft: true } }
        }
      })),
      { session }
    );
    return;
  }

  // 🔁 Reorden automático
  const dbNodes = await FlowNode.find(
    { flow_id, account_id },
    { _id: 1 },
    { session }
  ).sort({ order: 1 });

  if (!dbNodes.length) return;

  await FlowNode.bulkWrite(
    dbNodes.map((n, i) => ({
      updateOne: {
        filter: { _id: n._id },
        update: { $set: { order: i, is_draft: true } }
      }
    })),
    { session }
  );
};
