const mongoose = require('mongoose');

const depositConfigSchema = new mongoose.Schema(
  {
    workingDepositEnabled: { type: Boolean, default: true },
    securityDepositEnabled: { type: Boolean, default: true },
    minDepositAmountUsdt: { type: Number, default: 50 },
    maxDepositAmountUsdt: { type: Number, default: 100000 },
    minDepositAmountInr: { type: Number, default: 1000 },
    maxDepositAmountInr: { type: Number, default: 5000000 },
    allowedCurrencies: { type: [String], default: ['USDT', 'INR'] },
    depositExpiryMinutes: { type: Number, default: 30 },
    destinationWallets: [
      {
        currency: { type: String, default: 'USDT' },
        network: { type: String, default: 'TRC20' },
        address: { type: String, default: 'TQr8Vp6K9vW2Z4yL1m5N7q3J8xH2gB9dF1' },
        label: { type: String, default: 'Primary Corporate USDT-TRC20 Vault' },
        isActive: { type: Boolean, default: true },
      },
      {
        currency: { type: String, default: 'INR' },
        network: { type: String, default: 'IMPS/NEFT' },
        address: { type: String, default: 'HDFC0001234 / 50200012345678' },
        label: { type: String, default: 'Corporate Escrow Settlement Account' },
        isActive: { type: Boolean, default: true },
      },
    ],
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

const defaultWallets = [
  {
    currency: 'USDT',
    network: 'TRC20',
    address: 'TX7D7vH3qV8kYq4eR9P4dE8vL3kYq4eR9P',
    label: 'Primary Corporate USDT-TRC20 Vault',
    isActive: true,
  },
  {
    currency: 'INR',
    network: 'IMPS/NEFT',
    address: 'HDFC0001234 / 50200012345678',
    label: 'Corporate Escrow Settlement Account',
    isActive: true,
  },
];

depositConfigSchema.statics.getOrCreateDefault = async function () {
  let config = await this.findOne();
  if (!config) {
    config = await this.create({
      destinationWallets: defaultWallets,
    });
  } else if (!config.destinationWallets || config.destinationWallets.length === 0) {
    config.destinationWallets = defaultWallets;
    await config.save();
  }
  return config;
};

const DepositConfig = mongoose.model('DepositConfig', depositConfigSchema);

module.exports = DepositConfig;

