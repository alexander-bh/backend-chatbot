// utils/flowLock.js
const mongoose = require("mongoose");
const Flow = require("../models/Flow");

const LOCK_MINUTES = 15;

const validateIds = ({ flow_id, user_id, account_id }) => {

  if (!mongoose.Types.ObjectId.isValid(flow_id))
    throw new Error("flow_id inválido");

  if (!mongoose.Types.ObjectId.isValid(account_id))
    throw new Error("account_id inválido");

  if (!mongoose.Types.ObjectId.isValid(user_id))
    throw new Error("user_id inválido");
};

exports.acquireFlowLock = async ({
  flow_id,
  user_id,
  account_id,
  session
}) => {

  validateIds({ flow_id, user_id, account_id });

  const now = new Date();
  const expires = new Date(now.getTime() + LOCK_MINUTES * 60000);

  const userObjectId = new mongoose.Types.ObjectId(user_id);

  const flow = await Flow.findOneAndUpdate(
    {
      _id: flow_id,
      account_id,
      $or: [
        { lock: null },
        { "lock.lock_expires_at": { $lt: now } },
        { "lock.locked_by": userObjectId }
      ]
    },
    {
      $set: {
        lock: {
          locked_by: userObjectId,
          locked_at: now,
          lock_expires_at: expires
        }
      }
    },
    { new: true, session }
  );

  if (!flow) {
    throw new Error("Flow bloqueado por otro usuario");
  }

  return flow;
};


exports.releaseFlowLock = async ({
  flow_id,
  user_id,
  account_id,
  session
}) => {

  validateIds({ flow_id, user_id, account_id });

  const flow = await Flow.findOne({
    _id: flow_id,
    account_id
  }).session(session);

  if (!flow || !flow.lock) return;

  if (String(flow.lock.locked_by) === String(user_id)) {
    flow.lock = null;
    await flow.save({ session });
  }

  return true;
};


exports.refreshFlowLock = async ({
  flow_id,
  user_id,
  account_id,
  session
}) => {

  validateIds({ flow_id, user_id, account_id });

  const now = new Date();
  const expires = new Date(now.getTime() + LOCK_MINUTES * 60000);

  const flow = await Flow.findOne({
    _id: flow_id,
    account_id,
    "lock.locked_by": user_id
  }).session(session);

  if (!flow || !flow.lock) {
    throw new Error("No tienes el lock");
  }

  flow.lock.lock_expires_at = expires;

  await flow.save({ session });

  return true;
};
