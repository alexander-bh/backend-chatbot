const AuditLog = require("../models/AuditLog");

exports.log = async ({
  req,
  actorId,
  targetType,
  targetId,
  action,
  before,
  after,
  meta = {}
}) => {
  return AuditLog.create({
    actor_id: actorId || req?.user?.id || null,
    target_type: targetType,
    target_id: targetId,
    action,
    before,
    after,
    meta,
    ip: req?.ip,
    user_agent: req?.headers["user-agent"]
  });
};

