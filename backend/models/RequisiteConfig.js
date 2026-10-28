const mongoose = require('mongoose');

const requisiteConfigSchema = new mongoose.Schema(
  {
    upiEnabled: {
      type: Boolean,
      default: true,
    },
    impsEnabled: {
      type: Boolean,
      default: true,
    },
    maxRequisitesPerTrader: {
      type: Number,
      default: 20,
    },
    defaultDailyLimit: {
      type: Number,
      default: 500000,
    },
    maxDailyLimit: {
      type: Number,
      default: 5000000,
    },
    minDailyLimit: {
      type: Number,
      default: 10000,
    },
    minTransactionAmount: {
      type: Number,
      default: 100,
    },
    maxTransactionAmount: {
      type: Number,
      default: 100000,
    },
    autoApprove: {
      type: Boolean,
      default: false,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

requisiteConfigSchema.statics.getOrCreateDefault = async function () {
  let config = await this.findOne();
  if (!config) {
    config = await this.create({});
  }
  return config;
};

const RequisiteConfig = mongoose.model('RequisiteConfig', requisiteConfigSchema);

module.exports = RequisiteConfig;
