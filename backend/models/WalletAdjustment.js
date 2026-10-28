const mongoose = require('mongoose');

const walletAdjustmentSchema = new mongoose.Schema(
  {
    adjustmentId: {
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
    clientId: {
      type: String,
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['CREDIT', 'DEBIT'],
      required: true,
    },
    amount: {
      type: Number,
      required: [true, 'Adjustment amount is required'],
      min: [0.000001, 'Amount must be greater than zero'],
    },
    currency: {
      type: String,
      default: 'USDT',
      enum: ['USDT'],
      required: true,
    },
    reason: {
      type: String,
      required: [true, 'Adjustment reason is mandatory'],
      trim: true,
      minlength: [3, 'Reason must be at least 3 characters'],
      maxlength: [500, 'Reason cannot exceed 500 characters'],
    },
    referenceId: {
      type: String,
      required: [true, 'Supporting transaction or reference ID is mandatory'],
      trim: true,
      minlength: [3, 'Reference ID must be at least 3 characters'],
      maxlength: [100, 'Reference ID cannot exceed 100 characters'],
    },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
      required: true,
      index: true,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
    rejectionReason: {
      type: String,
      default: '',
      trim: true,
    },
    balanceBefore: {
      type: Number,
      default: 0,
    },
    balanceAfter: {
      type: Number,
      default: null,
    },
    rateUsed: {
      type: Number,
      default: 105,
    },
    inrEquivalent: {
      type: Number,
      default: null,
    },
    auditHistory: [
      {
        action: { type: String, required: true },
        performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        timestamp: { type: Date, default: Date.now },
        notes: { type: String, default: '' },
      },
    ],
  },
  {
    timestamps: true,
  }
);

walletAdjustmentSchema.index({ traderId: 1, createdAt: -1 });

const WalletAdjustment = mongoose.model('WalletAdjustment', walletAdjustmentSchema);

module.exports = WalletAdjustment;
