const mongoose = require('mongoose');

const requisiteSchema = new mongoose.Schema(
  {
    requisiteId: {
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
      enum: ['UPI', 'IMPS'],
      default: 'UPI',
      required: true,
      index: true,
    },
    accountHolderName: {
      type: String,
      required: true,
      trim: true,
    },
    upiId: {
      type: String,
      trim: true,
      default: null,
    },
    bankName: {
      type: String,
      required: true,
      trim: true,
    },
    accountNumber: {
      type: String,
      trim: true,
      default: null,
    },
    accountNumberLast4: {
      type: String,
      default: null,
    },
    ifsc: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
    note: {
      type: String,
      default: '',
      trim: true,
    },
    dailyLimit: {
      type: Number,
      required: true,
      min: [1, 'Daily limit must be positive'],
      default: 500000,
    },
    usedToday: {
      type: Number,
      default: 0,
      min: 0,
    },
    minAmount: {
      type: Number,
      default: 100,
      min: 0,
    },
    maxAmount: {
      type: Number,
      default: 50000,
      min: 0,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'PENDING_REVIEW', 'REJECTED'],
      default: 'INACTIVE',
      index: true,
    },
    approvalStatus: {
      type: String,
      enum: ['PENDING_REVIEW', 'APPROVED', 'REJECTED'],
      default: 'PENDING_REVIEW',
      index: true,
    },
    payinEnabled: {
      type: Boolean,
      default: false,
      index: true,
    },
    adminPayinAllowed: {
      type: Boolean,
      default: true,
      index: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    rejectionReason: {
      type: String,
      default: '',
    },
    auditHistory: [
      {
        action: { type: String, required: true },
        performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        timestamp: { type: Date, default: Date.now },
        notes: { type: String, default: '' },
        previousStatus: { type: String, default: '' },
        newStatus: { type: String, default: '' },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Helper to mask account number
requisiteSchema.pre('save', function (next) {
  if (this.accountNumber && this.accountNumber.length >= 4) {
    this.accountNumberLast4 = this.accountNumber.slice(-4);
  }
  next();
});

// Indexes for high performance searches and aggregations
requisiteSchema.index({ userId: 1, status: 1 });
requisiteSchema.index({ userId: 1, payinEnabled: 1 });
requisiteSchema.index({ accountHolderName: 'text', upiId: 'text', bankName: 'text' });

const Requisite = mongoose.model('Requisite', requisiteSchema);

module.exports = Requisite;
