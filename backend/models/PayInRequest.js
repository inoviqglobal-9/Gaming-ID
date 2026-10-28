const mongoose = require('mongoose');

const payInRequestSchema = new mongoose.Schema(
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
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [1, 'Amount must be greater than zero'],
    },
    currency: {
      type: String,
      enum: ['INR', 'USDT'],
      default: 'INR',
      required: true,
    },
    paymentPurpose: {
      type: String,
      default: 'Trader Deposit / PayIn',
    },
    status: {
      type: String,
      enum: [
        'PENDING',
        'SUBMITTED',
        'PENDING_VERIFICATION',
        'UNDER_REVIEW',
        'PROCESSING',
        'CONFIRMED',
        'DECLINED',
        'REJECTED',
        'EXPIRED',
        'DEMO_TRANSACTION',
      ],
      default: 'PENDING',
      index: true,
    },
    // Application-specific identification & mapping fields
    applicationId: {
      type: String,
      default: null,
    },
    orderId: {
      type: String,
      default: null,
    },
    utr: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
      default: null,
    },
    payerName: {
      type: String,
      default: null,
    },
    requisite: {
      type: String,
      default: null,
    },
    requisiteId: {
      type: String,
      default: '',
    },
    statusHistory: [
      {
        status: { type: String, required: true },
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        notes: { type: String, default: '' },
      },
    ],
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    reviewNotes: {
      type: String,
      default: '',
    },
    // Bound Scanner Snapshot (Ensures historical accuracy if scanner is replaced)
    scannerConfigId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ScannerConfig',
      default: null,
    },
    scannerId: {
      type: String,
      default: 'N/A',
      index: true,
    },
    scannerName: {
      type: String,
      default: 'Default Scanner',
    },
    scannerVersion: {
      type: Number,
      default: 1,
    },
    merchantName: {
      type: String,
      default: 'Authorized Merchant',
      index: true,
    },
    merchantIdentifier: {
      type: String,
      default: '',
    },
    paymentProvider: {
      type: String,
      default: 'PhonePe Business',
    },
    qrImageUrl: {
      type: String,
      default: '',
    },
    mode: {
      type: String,
      enum: ['LIVE', 'DEMO_ONLY'],
      default: 'LIVE',
      index: true,
    },
    isDemo: {
      type: Boolean,
      default: false,
      index: true,
    },
    // Payment Claim details submitted by Client
    referenceId: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
      default: null,
    },
    proofImageUrl: {
      type: String,
      default: null,
    },
    clientNotes: {
      type: String,
      maxlength: 500,
      default: '',
    },
    // Admin Verification & Confirmation Desk
    verificationStatus: {
      type: String,
      enum: ['UNVERIFIED', 'VERIFIED', 'UNDER_REVIEW', 'REJECTED'],
      default: 'UNVERIFIED',
      index: true,
    },
    verificationEvidence: {
      type: String,
      default: '',
    },
    adminConfirmationStatus: {
      type: String,
      enum: ['PENDING', 'ADMIN_CONFIRMED', 'REJECTED'],
      default: 'PENDING',
      index: true,
    },
    adminDecisionNotes: {
      type: String,
      maxlength: 500,
      default: '',
    },
    expiresAt: {
      type: Date,
      required: true,
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
    adminConfirmedAt: {
      type: Date,
      default: null,
    },
    adminConfirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

payInRequestSchema.pre('save', function (next) {
  if (!this.applicationId) this.applicationId = this.requestId;
  if (!this.utr && this.referenceId) this.utr = this.referenceId;
  if (!this.referenceId && this.utr) this.referenceId = this.utr;
  if (!this.orderId) {
    this.orderId = `ORD-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;
  }
  if (!this.requisite) this.requisite = this.merchantName || 'Default UPI';
  if (!this.payerName) this.payerName = this.clientId || 'Authorized Trader';
  next();
});

// Compound indexes for fast client queries
payInRequestSchema.index({ clientId: 1, createdAt: -1 });
payInRequestSchema.index({ userId: 1, createdAt: -1 });
payInRequestSchema.index({ status: 1, createdAt: -1 });
payInRequestSchema.index({ applicationId: 1, createdAt: -1 });
payInRequestSchema.index({ orderId: 1, createdAt: -1 });

const PayInRequest = mongoose.model('PayInRequest', payInRequestSchema);

module.exports = PayInRequest;
