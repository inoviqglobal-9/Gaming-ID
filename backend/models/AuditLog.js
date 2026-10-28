const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      index: true,
    },
    performedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    performedByUsername: {
      type: String,
      default: 'SYSTEM',
    },
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    targetUsername: {
      type: String,
      default: null,
    },
    role: {
      type: String,
      default: null,
    },
    ipAddress: {
      type: String,
      default: '',
    },
    userAgent: {
      type: String,
      default: '',
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

auditLogSchema.index({ createdAt: -1 });

// Helper to record safe audit log
auditLogSchema.statics.log = async function ({
  action,
  user,
  targetUser,
  ipAddress,
  userAgent,
  details = {},
}) {
  try {
    return await this.create({
      action,
      performedByUserId: user ? (user._id || user.id) : null,
      performedByUsername: user ? user.username : 'SYSTEM',
      role: user ? user.role : null,
      targetUserId: targetUser ? (targetUser._id || targetUser.id) : null,
      targetUsername: targetUser ? targetUser.username : null,
      ipAddress: ipAddress || '',
      userAgent: userAgent || '',
      details,
    });
  } catch (err) {
    console.error('[AuditLog Error] Failed to write log:', err.message);
  }
};

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = AuditLog;
