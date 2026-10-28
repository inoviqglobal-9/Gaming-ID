const mongoose = require('mongoose');

const cryptoRequestSchema = new mongoose.Schema(
  {
    requestId: {
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
    clientId: {
      type: String,
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['DEPOSIT', 'WITHDRAWAL'],
      required: true,
    },
    assetSymbol: {
      type: String,
      enum: ['USDT', 'BTC', 'ETH'],
      default: 'USDT',
      required: true,
    },
    network: {
      type: String,
      enum: ['TRC20', 'ERC20', 'BEP20', 'BITCOIN'],
      required: true,
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0.000001, 'Amount must be greater than zero'],
    },
    walletAddress: {
      type: String,
      required: true,
      trim: true,
    },
    txHash: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['PENDING', 'UNDER_REVIEW', 'CONFIRMED', 'REJECTED'],
      default: 'PENDING',
      index: true,
    },
    adminDecisionNotes: {
      type: String,
      maxlength: 500,
      default: '',
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

cryptoRequestSchema.index({ clientId: 1, createdAt: -1 });

const CryptoRequest = mongoose.model('CryptoRequest', cryptoRequestSchema);

module.exports = CryptoRequest;
