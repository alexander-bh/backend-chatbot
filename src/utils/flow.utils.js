const mongoose = require("mongoose");
const Flow = require("../models/Flow");

exports.getEditableFlow = async (flow_id, account_id) => {
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
