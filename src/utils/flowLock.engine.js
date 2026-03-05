// utils/flowLock.js
const mongoose = require("mongoose");
const Flow = require("../models/Flow");

const LOCK_MINUTES = 15;

exports.acquireFlowLock = async ({
  flow_id,
  user_id,
  session
}) => {

  if (!mongoose.Types.ObjectId.isValid(flow_id))
    throw new Error("flow_id inválido");

  if (!mongoose.Types.ObjectId.isValid(user_id))
    throw new Error("user_id inválido");

  const now = new Date();
  const expires = new Date(now.getTime() + 15 * 60000);
  const userObjectId = new mongoose.Types.ObjectId(user_id);

  const flow = await Flow.findById(flow_id).session(session);

  if (!flow) {
    throw new Error("Flow no encontrado");
  }

  const canLock =
    !flow.lock ||
    !flow.lock.lock_expires_at ||
    flow.lock.lock_expires_at < now ||
    flow.lock.locked_by?.toString() === userObjectId.toString();

  if (!canLock) {
    throw new Error("Flow bloqueado por otro usuario");
  }

  flow.lock = {
    locked_by: userObjectId,
    locked_at: now,
    lock_expires_at: expires
  };

  await flow.save({ session });

  return flow;
};