//utils flow.utils.js
const Flow = require("../models/Flow");
exports.getEditableFlow = async (
  flow_id,
  account_id,
  session
) => {

  const flow = await Flow.findOne({
    _id: flow_id,
    account_id,
    status: "draft"
  }).session(session);

  if (!flow) {
    throw new Error("Flow no editable o no autorizado");
  }

  return flow;
};

