const AuditLog = require('../models/AuditLog');

/**
 * Record an action. Never throws: a logging problem must not break the request.
 * actor defaults to the logged-in user on req.
 */
async function audit(req, action, { actor, success = true, target, meta } = {}) {
  try {
    const a = actor || (req.user ? { id: String(req.user._id), role: req.user.role, label: req.user.email } : {});
    await AuditLog.create({
      action,
      success,
      actorId: a.id,
      actorRole: a.role,
      actorLabel: a.label,
      targetType: target && target.type,
      targetLabel: target && target.label,
      ip: req.ip,
      userAgent: String(req.get ? req.get('user-agent') || '' : '').slice(0, 200),
      meta,
    });
  } catch (err) {
    console.error('[audit] could not write', action, err.message);
  }
}

module.exports = { audit };
