const mongoose = require('mongoose');
require('./User');

const cryptoAuditSchema = new mongoose.Schema(
  {
    usdtRateINR: { type: Number, required: true },
    depositBonusPercent: { type: Number, required: true },
    withdrawalBonusPercent: { type: Number, required: true },
    previousUsdtRateINR: { type: Number, required: true },
    previousDepositBonusPercent: { type: Number, required: true },
    previousWithdrawalBonusPercent: { type: Number, required: true },
    changeReason: { type: String, default: '' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedByUsername: { type: String, default: '' },
    version: { type: Number, required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: true }
);

const cryptoCommercialSettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: 'CRYPTO_COMMERCIAL_SETTINGS',
    },
    usdtRateINR: {
      type: Number,
      required: true,
      default: 105.00,
      min: [0.01, 'USDT rate must be greater than zero'],
      max: [100000, 'USDT rate exceeds maximum limit'],
    },
    depositBonusPercent: {
      type: Number,
      required: true,
      default: 3.00,
      min: [0, 'Deposit bonus cannot be negative'],
      max: [100, 'Deposit bonus cannot exceed 100%'],
    },
    withdrawalBonusPercent: {
      type: Number,
      required: true,
      default: 1.00,
      min: [0, 'Withdrawal bonus cannot be negative'],
      max: [99.99, 'Withdrawal bonus must be less than 100%'],
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
      default: 'Initial platform commercial crypto settings',
    },
    auditHistory: [cryptoAuditSchema],
  },
  {
    timestamps: true,
  }
);

cryptoCommercialSettingsSchema.statics.getSettings = async function () {
  let doc = await this.findOne({ key: 'CRYPTO_COMMERCIAL_SETTINGS' }).populate('updatedBy', 'username fullName');
  if (!doc) {
    doc = await this.create({
      key: 'CRYPTO_COMMERCIAL_SETTINGS',
      usdtRateINR: 105.00,
      depositBonusPercent: 3.00,
      withdrawalBonusPercent: 1.00,
      version: 1,
      changeReason: 'Initial platform commercial crypto settings',
      auditHistory: [
        {
          usdtRateINR: 105.00,
          depositBonusPercent: 3.00,
          withdrawalBonusPercent: 1.00,
          previousUsdtRateINR: 105.00,
          previousDepositBonusPercent: 3.00,
          previousWithdrawalBonusPercent: 1.00,
          changeReason: 'Initial platform commercial crypto settings',
          version: 1,
          timestamp: new Date(),
        },
      ],
    });
  }
  return doc;
};

cryptoCommercialSettingsSchema.statics.updateSettings = async function ({
  newRate,
  newDepositBonus,
  newWithdrawalBonus,
  changeReason,
  user,
}) {
  let doc = await this.findOne({ key: 'CRYPTO_COMMERCIAL_SETTINGS' });
  if (!doc) {
    doc = await this.getSettings();
  }

  const previousUsdtRateINR = doc.usdtRateINR !== undefined ? doc.usdtRateINR : 105.00;
  const previousDepositBonusPercent = doc.depositBonusPercent !== undefined ? doc.depositBonusPercent : 3.00;
  const previousWithdrawalBonusPercent = doc.withdrawalBonusPercent !== undefined ? doc.withdrawalBonusPercent : 1.00;

  // Validate and assign Rate
  if (newRate !== undefined && newRate !== null && newRate !== '') {
    const parsedRate = Number(newRate);
    if (isNaN(parsedRate) || parsedRate <= 0) {
      throw new Error('USDT rate must be a valid positive number');
    }
    if (parsedRate > 100000) {
      throw new Error('USDT rate exceeds maximum limit of 100,000');
    }
    doc.usdtRateINR = Math.round(parsedRate * 10000) / 10000;
  }

  // Validate and assign Deposit Bonus
  if (newDepositBonus !== undefined && newDepositBonus !== null && newDepositBonus !== '') {
    const parsedDep = Number(newDepositBonus);
    if (isNaN(parsedDep) || parsedDep < 0 || parsedDep > 100) {
      throw new Error('Deposit bonus percentage must be between 0% and 100%');
    }
    doc.depositBonusPercent = Math.round(parsedDep * 100) / 100;
  }

  // Validate and assign Withdrawal Bonus
  if (newWithdrawalBonus !== undefined && newWithdrawalBonus !== null && newWithdrawalBonus !== '') {
    const parsedWd = Number(newWithdrawalBonus);
    if (isNaN(parsedWd) || parsedWd < 0 || parsedWd >= 100) {
      throw new Error('Withdrawal bonus percentage must be between 0% and 99.99%');
    }
    doc.withdrawalBonusPercent = Math.round(parsedWd * 100) / 100;
  }

  const newVersion = (doc.version || 0) + 1;
  const reason = changeReason ? changeReason.trim() : 'Admin updated crypto commercial settings';

  doc.version = newVersion;
  doc.updatedBy = user?._id || null;
  doc.updatedByUsername = user?.username || '';
  doc.changeReason = reason;

  if (!doc.auditHistory) doc.auditHistory = [];
  doc.auditHistory.unshift({
    usdtRateINR: doc.usdtRateINR,
    depositBonusPercent: doc.depositBonusPercent,
    withdrawalBonusPercent: doc.withdrawalBonusPercent,
    previousUsdtRateINR,
    previousDepositBonusPercent,
    previousWithdrawalBonusPercent,
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

module.exports = mongoose.model('CryptoCommercialSettings', cryptoCommercialSettingsSchema);
