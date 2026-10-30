const mongoose = require('mongoose');

const cryptoWithdrawalRequestSchema = new mongoose.Schema(
  {
    requestId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    traderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    traderUsername: {
      type: String,
      required: true,
      index: true,
    },
    type: {
      type: String,
      default: 'CRYPTO_WITHDRAWAL',
    },
    systemType: {
      type: String,
      enum: ['NORMAL', 'CRYPTO'],
      default: 'CRYPTO',
      index: true,
    },
    // Full requested USDT amount (e.g. 1000)
    usdtAmount: {
      type: Number,
      required: [true, 'USDT Amount is required'],
      min: [1, 'Minimum withdrawal is 1 USDT'],
    },
    requestedUSDT: {
      type: Number,
      default: function () {
        return this.usdtAmount;
      },
    },
    baseRate: {
      type: Number,
      default: 105.0,
      required: true,
    },
    baseInrAmount: {
      type: Number,
      required: true,
    },
    settingsVersion: {
      type: Number,
      default: 1,
      required: false,
    },
    // 1% Bonus System fields
    bonusPercent: {
      type: Number,
      default: 1.0,
      required: true,
    },
    bonusUSDT: {
      type: Number,
      default: 0,
      required: true,
    },
    // Actual USDT balance debit = 99% of requestedUSDT (e.g. 990)
    balanceDebitUSDT: {
      type: Number,
      default: function () {
        return this.usdtAmount;
      },
      required: true,
    },
    // Full requested payout obligation: 100% of requested amount!
    payoutUSDTEquivalent: {
      type: Number,
      default: function () {
        return this.usdtAmount;
      },
      required: true,
    },
    settlementMethod: {
      type: String,
      default: 'UPI_INR',
    },
    settlementRateINR: {
      type: Number,
      default: 105.0,
    },
    payoutINR: {
      type: Number,
      default: function () {
        return this.finalInrPayout;
      },
    },
    // Legacy compatibility fields (Fee is 0%)
    withdrawalDeductionPercent: {
      type: Number,
      default: 0.0,
      required: true,
    },
    withdrawalDeductionAmount: {
      type: Number,
      default: 0.0,
      required: true,
    },
    finalInrPayout: {
      type: Number,
      required: true,
    },
    effectiveRate: {
      type: Number,
      default: 105.0,
      required: true,
    },
    // Payment destinations: PhonePe / UPI QR or UPI ID
    traderQrImageUrl: {
      type: String,
      default: '',
    },
    qrImage: {
      type: String,
      default: function () {
        return this.traderQrImageUrl || '';
      },
    },
    traderUpiId: {
      type: String,
      trim: true,
      default: '',
    },
    upiId: {
      type: String,
      trim: true,
      default: function () {
        return this.traderUpiId || '';
      },
    },
    status: {
      type: String,
      enum: [
        'PENDING_REVIEW',
        'PENDING',
        'APPROVED',
        'PAYOUT_PROCESSING',
        'RECONCILIATION_REQUIRED',
        'COMPLETED',
        'REJECTED',
        'CANCELLED',
      ],
      default: 'PENDING_REVIEW',
      index: true,
    },
    payoutReference: {
      type: String,
      trim: true,
      default: '',
    },
    payoutInitiatedAt: {
      type: Date,
      default: null,
    },
    payoutVerifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    payoutVerifiedAt: {
      type: Date,
      default: null,
    },
    rejectionReason: {
      type: String,
      default: '',
    },
    ledgerReferenceId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

cryptoWithdrawalRequestSchema.index({ traderId: 1, createdAt: -1 });
cryptoWithdrawalRequestSchema.index({ systemType: 1, createdAt: -1 });

const CryptoWithdrawalRequest = mongoose.model(
  'CryptoWithdrawalRequest',
  cryptoWithdrawalRequestSchema
);

module.exports = CryptoWithdrawalRequest;
