const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema(
  {
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    username: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ['ADMIN', 'CLIENT', 'TRADER'],
      required: true,
    },
    ipAddress: {
      type: String,
      default: '',
    },
    userAgent: {
      type: String,
      default: '',
    },
    isRevoked: {
      type: Boolean,
      default: false,
      index: true,
    },
    revokedReason: {
      type: String,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // MongoDB TTL auto-cleanup
    },
  },
  {
    timestamps: true,
  }
);

// Helper to revoke all sessions of a user (e.g. on suspension, password reset, or admin action)
sessionSchema.statics.revokeAllUserSessions = async function (userId, reason = 'Administrative action or password reset') {
  return this.updateMany(
    { userId, isRevoked: false },
    { $set: { isRevoked: true, revokedReason: reason } }
  );
};

const Session = mongoose.model('Session', sessionSchema);

module.exports = Session;
