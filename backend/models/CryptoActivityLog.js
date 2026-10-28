const mongoose = require('mongoose');

const cryptoActivityLogSchema = new mongoose.Schema(
  {
    activityId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    traderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    traderUsername: {
      type: String,
      default: '',
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    actorRole: {
      type: String,
      enum: ['ADMIN', 'TRADER', 'SYSTEM'],
      required: true,
    },
    actionType: {
      type: String,
      required: true,
      index: true,
    },
    requestId: {
      type: String,
      default: '',
      index: true,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    description: {
      type: String,
      required: true,
    },
    ipAddress: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

cryptoActivityLogSchema.statics.log = async function ({
  traderId,
  traderUsername,
  actorId,
  actorRole,
  actionType,
  requestId,
  details,
  description,
  ipAddress,
}) {
  try {
    const activityId = `ACT-CRP-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;
    return await this.create({
      activityId,
      traderId,
      traderUsername,
      actorId,
      actorRole,
      actionType,
      requestId,
      details,
      description,
      ipAddress,
    });
  } catch (err) {
    console.error('[CryptoActivityLog Error]:', err.message);
  }
};

const CryptoActivityLog = mongoose.model('CryptoActivityLog', cryptoActivityLogSchema);

module.exports = CryptoActivityLog;
