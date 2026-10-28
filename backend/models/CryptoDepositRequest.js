const mongoose = require('mongoose');

const cryptoDepositRequestSchema = new mongoose.Schema(
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
    // Dynamic user-entered USDT deposit amount (supports fractions e.g. 125.50)
    depositAmountUSDT: {
      type: Number,
      required: [true, 'USDT Deposit Amount is required'],
      min: [0.000001, 'Deposit amount must be greater than 0'],
    },
    usdtAmount: {
      type: Number,
      required: [true, 'USDT Amount is required'],
      min: [0.000001, 'Amount must be greater than 0'],
    },
    // Exact USDT Deposit (0% Bonus, 1:1 Crediting)
    bonusPercent: {
      type: Number,
      default: 0.0,
      required: false,
    },
    bonusAmountUSDT: {
      type: Number,
      default: 0.0,
      required: false,
    },
    totalCreditUSDT: {
      type: Number,
      default: 0,
      required: true,
    },
    // Fixed ₹105 Rate & INR Equivalent (display only)
    fixedRate: {
      type: Number,
      default: 105.0,
      required: false,
    },
    inrEquivalent: {
      type: Number,
      default: 0.0,
      required: false,
    },
    // Blockchain details
    network: {
      type: String,
      default: 'TRC20',
      trim: true,
    },
    destinationWalletAddress: {
      type: String,
      default: 'TX7D7vH3qV8kYq4eR9P4dE8vL3kYq4eR9P',
      trim: true,
    },
    txHash: {
      type: String,
      trim: true,
      default: '',
      index: true,
    },
    // Legacy / backward-compatible INR fields
    baseRate: {
      type: Number,
      default: 105.0,
      required: false,
    },
    baseInrAmount: {
      type: Number,
      default: 0,
      required: false,
    },
    depositFeePercent: {
      type: Number,
      default: 0.0,
      required: false,
    },
    depositFeeAmount: {
      type: Number,
      default: 0,
      required: false,
    },
    totalInrPayable: {
      type: Number,
      default: 0,
      required: false,
    },
    effectiveRate: {
      type: Number,
      default: 105.0,
      required: false,
    },
    qrId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CryptoPaymentQR',
      default: null,
    },
    qrSnapshot: {
      qrImageUrl: { type: String, default: '' },
      upiId: { type: String, default: '' },
      merchantName: { type: String, default: '' },
      network: { type: String, default: 'TRC20' },
      walletAddress: { type: String, default: '' },
    },
    paymentProofUrl: {
      type: String,
      default: '',
    },
    utr: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: [
        'PENDING_VERIFICATION',
        'UNDER_REVIEW',
        'APPROVED_AWAITING_FULFILLMENT',
        'COMPLETED',
        'REJECTED',
        'EXPIRED',
      ],
      default: 'PENDING_VERIFICATION',
      index: true,
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    verifiedAt: {
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

cryptoDepositRequestSchema.index({ traderId: 1, createdAt: -1 });

const CryptoDepositRequest = mongoose.model('CryptoDepositRequest', cryptoDepositRequestSchema);

module.exports = CryptoDepositRequest;
