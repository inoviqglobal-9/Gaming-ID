const mongoose = require('mongoose');

const walletCheckSettingsSchema = new mongoose.Schema(
  {
    enabled: {
      type: Boolean,
      default: true,
    },
    feeAmount: {
      type: Number,
      default: 3.0,
      min: 0,
    },
    feeCurrency: {
      type: String,
      default: 'USDT',
      uppercase: true,
    },
    supportedNetworks: {
      type: [String],
      default: ['TRC-20', 'ERC-20', 'BTC'],
    },
    providerName: {
      type: String,
      default: 'TRM Labs',
      trim: true,
    },
    providerApiKey: {
      type: String,
      default: '',
      trim: true,
    },
    providerApiUrl: {
      type: String,
      default: 'https://api.trmlabs.com/public/v2/screening/addresses',
      trim: true,
    },
    dailyCheckLimit: {
      type: Number,
      default: 50,
      min: 1,
    },
    providerTimeout: {
      type: Number,
      default: 15,
      min: 3,
      max: 60,
    },
    sandboxMode: {
      type: Boolean,
      default: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

walletCheckSettingsSchema.statics.getOrCreateDefault = async function () {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({
      enabled: true,
      feeAmount: 3.0,
      feeCurrency: 'USDT',
      supportedNetworks: ['TRC-20', 'ERC-20', 'BTC'],
      providerName: 'TRM Labs',
      sandboxMode: true,
    });
  }
  return settings;
};

const WalletCheckSettings = mongoose.model('WalletCheckSettings', walletCheckSettingsSchema);

module.exports = WalletCheckSettings;
