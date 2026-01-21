const mongoose = require("mongoose");
const Flow = require("../models/Flow");

exports.getEditableFlow = async (flow_id, account_id) => {
  if (!mongoose.Types.ObjectId.isValid(flow_id)) {
    throw new Error("flow_id inválido");
  }

  const flow = await Flow.findOne({
    _id: flow_id,
    account_id,
    is_active: false
  });

  if (!flow) {
    throw new Error("Flow no editable o no autorizado");
  }

  return flow;
};
