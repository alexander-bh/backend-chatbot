//utils flow.utils.js
const mongoose = require("mongoose");
const Flow = require("../models/Flow");

exports.getEditableFlow = async (flow_id, account_id) => {

  if (!flow_id) throw new Error("flow_id requerido");

  if (!mongoose.Types.ObjectId.isValid(flow_id)) {
    throw new Error("flow_id inválido");
  }

  if (!mongoose.Types.ObjectId.isValid(account_id)) {
    throw new Error("account_id inválido");
  }

  const flow = await Flow.findOne({
    _id: flow_id,
    account_id,
    status: "draft"
  });

  if (!flow) {
    throw new Error("Flow no editable o no autorizado");
  }

  return flow;
};
