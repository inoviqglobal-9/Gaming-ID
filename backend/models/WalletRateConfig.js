const mongoose = require('mongoose');
require('./User');

const rateAuditSchema = new mongoose.Schema(
  {
    rateINRPerUSDT: { type: Number, required: true },
    previousRate: { type: Number, required: true },
    changeReason: { type: String, default: '' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedByUsername: { type: String, default: '' },
    version: { type: Number, required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: true }
);

const walletRateConfigSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: 'USDT_WALLET_VALUATION_RATE',
    },
    rateINRPerUSDT: {
      type: Number,
      required: true,
      default: 105.00,
      min: [0.01, 'USDT rate must be greater than zero'],
      max: [100000, 'USDT rate exceeds maximum limit'],
    },
    version: {
      type: Number,
      default: 1,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    updatedByUsername: {
      type: String,
      default: '',
    },
    changeReason: {
      type: String,
      default: 'Initial platform default valuation rate',
    },
    auditHistory: [rateAuditSchema],
  },
  {
    timestamps: true,
  }
);

walletRateConfigSchema.statics.getActiveRate = async function () {
  let doc = await this.findOne({ key: 'USDT_WALLET_VALUATION_RATE' }).populate('updatedBy', 'username fullName');
  if (!doc) {
    doc = await this.create({
      key: 'USDT_WALLET_VALUATION_RATE',
      rateINRPerUSDT: 105.00,
      version: 1,
      changeReason: 'Initial platform default valuation rate',
      auditHistory: [
        {
          rateINRPerUSDT: 105.00,
          previousRate: 105.00,
          changeReason: 'Initial platform default valuation rate',
          version: 1,
          timestamp: new Date(),
        },
      ],
    });
  }
  return doc;
};

walletRateConfigSchema.statics.updateRate = async function ({ newRate, changeReason, user }) {
  let doc = await this.findOne({ key: 'USDT_WALLET_VALUATION_RATE' });
  if (!doc) {
    doc = new this({
      key: 'USDT_WALLET_VALUATION_RATE',
      rateINRPerUSDT: 105.00,
      version: 0,
    });
  }

  const previousRate = doc.rateINRPerUSDT || 105.00;
  const newVersion = (doc.version || 0) + 1;
  const reason = changeReason ? changeReason.trim() : 'Admin updated USDT valuation rate';

  doc.rateINRPerUSDT = Number(newRate);
  doc.version = newVersion;
  doc.updatedBy = user?._id || null;
  doc.updatedByUsername = user?.username || '';
  doc.changeReason = reason;

  if (!doc.auditHistory) doc.auditHistory = [];
  doc.auditHistory.unshift({
    rateINRPerUSDT: Number(newRate),
    previousRate,
    changeReason: reason,
    updatedBy: user?._id || null,
    updatedByUsername: user?.username || '',
    version: newVersion,
    timestamp: new Date(),
  });

  if (doc.auditHistory.length > 50) {
    doc.auditHistory = doc.auditHistory.slice(0, 50);
  }

  await doc.save();
  return doc;
};

module.exports = mongoose.model('WalletRateConfig', walletRateConfigSchema);
