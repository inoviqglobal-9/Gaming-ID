const mongoose = require('mongoose');

const cryptoPaymentQRSchema = new mongoose.Schema(
  {
    qrId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    walletAddress: {
      type: String,
      required: [true, 'Wallet Address is required'],
      trim: true,
      index: true,
    },
    qrImageUrl: {
      type: String,
      required: [true, 'QR code image URL is required'],
    },
    network: {
      type: String,
      trim: true,
      default: 'TRC20',
    },
    title: {
      type: String,
      trim: true,
      default: 'Official USDT TRC20 Wallet',
    },
    merchantName: {
      type: String,
      trim: true,
      default: 'RisePay Corporate Vault',
    },
    upiId: {
      type: String,
      trim: true,
      default: '',
    },
    instructions: {
      type: String,
      default: 'Transfer exact USDT to this official destination wallet on the specified blockchain network.',
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Helper to set this QR as the sole active one
cryptoPaymentQRSchema.statics.setActiveQR = async function (id) {
  await this.updateMany({}, { isActive: false });
  return this.findByIdAndUpdate(id, { isActive: true }, { new: true });
};

// Helper to get current active QR for trader deposit display
cryptoPaymentQRSchema.statics.getActiveQR = async function () {
  return this.findOne({ isActive: true });
};

const CryptoPaymentQR = mongoose.model('CryptoPaymentQR', cryptoPaymentQRSchema);

module.exports = CryptoPaymentQR;
