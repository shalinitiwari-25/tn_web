const mongoose = require('mongoose');

// Who did what, when, from where. Written by utils/audit.js; never stores passwords or codes.
const AuditLogSchema = new mongoose.Schema({
  action: { type: String, required: true, index: true },
  success: { type: Boolean, default: true },
  actorId: { type: String },
  actorRole: { type: String },
  actorLabel: { type: String },          // email, or the email that was attempted
  targetType: { type: String },
  targetLabel: { type: String },
  ip: { type: String },
  userAgent: { type: String },
  meta: { type: mongoose.Schema.Types.Mixed },
}, { timestamps: { createdAt: true, updatedAt: false } });
AuditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
