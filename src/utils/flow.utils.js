//utils flow.utils.js
const Flow = require("../models/Flow");

exports.getEditableFlow = async (flow_id, account_id) => {
  if (!flow_id) {
    throw new Error("flow_id requerido");
  }

  const flow = await Flow.findOne({
    _id: flow_id,
    account_id,
    is_draft: true
  });

  if (!flow) {
    throw new Error("Flow no editable o no autorizado");
  }

  return flow;
};
