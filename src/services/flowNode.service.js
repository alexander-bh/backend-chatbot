const mongoose = require("mongoose");
const FlowNode = require("../models/FlowNode");
const { getEditableFlow } = require("../utils/flow.utils");

const toObjectId = (id, field = "id") => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error(`${field} inválido`);
  }
  return new mongoose.Types.ObjectId(id);
};

/* ─────────────────────────────────────────────
   Obtener nodos por flow
───────────────────────────────────────────── */
exports.getNodesByFlow = async (flow_id, account_id) => {

  const flowId = toObjectId(flow_id, "flow_id");
  const accountId = toObjectId(account_id, "account_id");

  await getEditableFlow(flowId, accountId);

  return FlowNode.find({
    flow_id: flowId,
    account_id: accountId
  }).sort({ order: 1 });
};
