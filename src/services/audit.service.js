const AuditLog = require("../models/AuditLog");

exports.log = async ({
  req,
  targetType,
  targetId,
  action,
  before,
  after
}) => {
  try {
    await AuditLog.create({
      actor_id: req.user.id,
      target_type: targetType,
      target_id: targetId,
      action,
      before,
      after,
      ip: req.ip,
      user_agent: req.headers["user-agent"]
    });
  } catch (err) {
    console.error("AUDIT LOG ERROR:", err.message);
  }
};
