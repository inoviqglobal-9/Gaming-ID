const mongoose = require('mongoose');

const walletCheckSchema = new mongoose.Schema(
  {
    checkId: {
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
    walletAddress: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    network: {
      type: String,
      required: true,
      default: 'TRC-20',
      uppercase: true,
    },
    provider: {
      type: String,
      required: true,
      default: 'TRM Labs',
    },
    providerRequestId: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['PENDING', 'COMPLETED', 'FAILED'],
      default: 'PENDING',
      index: true,
    },
    riskScore: {
      type: Number,
      default: null,
      min: 0,
      max: 100,
    },
    riskCategory: {
      type: String,
      enum: ['LOW_RISK', 'MEDIUM_RISK', 'HIGH_RISK', 'CRITICAL_RISK', 'UNKNOWN'],
      default: 'UNKNOWN',
      index: true,
    },
    riskIndicators: [
      {
        category: { type: String, default: '' },
        severity: { type: String, default: 'LOW' },
        description: { type: String, default: '' },
        entity: { type: String, default: '' },
      },
    ],
    providerResult: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    feeAmount: {
      type: Number,
      default: 3.0,
      min: 0,
    },
    feeCurrency: {
      type: String,
      default: 'USDT',
    },
    feeStatus: {
      type: String,
      enum: ['CHARGED', 'NOT_CHARGED', 'REFUNDED'],
      default: 'NOT_CHARGED',
    },
    ledgerReference: {
      type: String,
      default: '',
    },
    completedAt: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

walletCheckSchema.index({ userId: 1, createdAt: -1 });

const WalletCheck = mongoose.model('WalletCheck', walletCheckSchema);

module.exports = WalletCheck;
