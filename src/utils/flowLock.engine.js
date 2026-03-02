// utils/flowLock.js
const mongoose = require("mongoose");
const Flow = require("../models/Flow");

const LOCK_MINUTES = 15;

exports.acquireFlowLock = async ({
  flow_id,
  user_id,
  account_id,
  session
}) => {

  if (!mongoose.Types.ObjectId.isValid(flow_id))
    throw new Error("flow_id inválido");

  if (!mongoose.Types.ObjectId.isValid(user_id))
    throw new Error("user_id inválido");

  const flowDoc = await Flow.findById(flow_id).session(session);

  if (!flowDoc) {
    throw new Error("Flow no encontrado");
  }

  const isTemplate = flowDoc.is_template === true;

  // 🔥 SOLO validar account_id si NO es template
  if (!isTemplate) {
    if (!mongoose.Types.ObjectId.isValid(account_id))
      throw new Error("account_id inválido");
  }

  const now = new Date();
  const expires = new Date(now.getTime() + LOCK_MINUTES * 60000);

  const userObjectId = new mongoose.Types.ObjectId(user_id);

  const flow = await Flow.findOneAndUpdate(
    {
      _id: flow_id,
      ...(isTemplate ? {} : { account_id }),
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