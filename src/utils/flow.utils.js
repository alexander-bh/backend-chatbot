//utils flow.utils.js
const Flow = require("../models/Flow");

exports.getEditableFlow = async (
  flow_id,
  account_id,
  session = null
) => {

  const query = {
    _id: flow_id,
    account_id,
    status: "draft"
  };

  const q = Flow.findOne(query);

  if (session) {
    q.session(session);
  }

  const flow = await q;

  if (!flow) {
    throw new Error("Flow no editable o no autorizado");
  }

  return flow;
};
