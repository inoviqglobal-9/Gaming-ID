const mongoose = require('mongoose');

const depositRequestSchema = new mongoose.Schema(
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
      required: [true, 'Deposit amount is required'],
      min: [1, 'Amount must be greater than zero'],
    },
    currency: {
      type: String,
      enum: ['INR', 'USDT'],
      default: 'INR',
      required: true,
    },
    systemType: {
      type: String,
      enum: ['NORMAL', 'CRYPTO'],
      default: 'NORMAL',
      index: true,
    },
    depositType: {
      type: String,
      enum: ['WORKING_DEPOSIT', 'SECURITY_DEPOSIT'],
      default: 'WORKING_DEPOSIT',
      index: true,
    },
    wallet: {
      type: String,
      default: null,
    },
    scannerConfigId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ScannerConfig',
      default: null,
    },
    scannerId: {
      type: String,
      default: '',
    },
    qrImageUrl: {
      type: String,
      default: '',
    },
    destinationWalletSnapshot: {
      address: { type: String, default: '' },
      network: { type: String, default: '' },
      currency: { type: String, default: '' },
      label: { type: String, default: '' },
      scannerId: { type: String, default: '' },
      qrImageUrl: { type: String, default: '' },
    },
    txHash: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
      default: null,
    },
    screenshot: {
      type: String,
      default: null,
    },
    network: {
      type: String,
      default: 'TRC20',
    },
    status: {
      type: String,
      enum: [
        'DRAFT',
        'PENDING',
        'AWAITING_PAYMENT',
        'SUBMITTED',
        'UNDER_REVIEW',
        'APPROVED',
        'CONFIRMED',
        'REJECTED',
        'EXPIRED',
        'CANCELLED',
      ],
      default: 'DRAFT',
      index: true,
    },
    verification: {
      type: String,
      enum: ['NOT_CHECKED', 'CHECKING', 'VERIFIED', 'FAILED'],
      default: 'NOT_CHECKED',
      index: true,
    },
    verificationSource: {
      type: String,
      default: 'MANUAL_AUDIT',
    },
    proofReference: {
      type: String,
      trim: true,
      sparse: true,
      default: null,
    },
    proofImage: {
      type: String,
      default: null,
    },
    clientNotes: {
      type: String,
      maxlength: 500,
      default: '',
    },
    adminDecisionNotes: {
      type: String,
      maxlength: 500,
      default: '',
    },
    rejectionReason: {
      type: String,
      maxlength: 500,
      default: '',
    },
    submittedAt: {
      type: Date,
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
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

depositRequestSchema.pre('save', function (next) {
  if (!this.txHash && this.proofReference) this.txHash = this.proofReference;
  if (!this.proofReference && this.txHash) this.proofReference = this.txHash;
  if (!this.screenshot && this.proofImage) this.screenshot = this.proofImage;
  if (!this.proofImage && this.screenshot) this.proofImage = this.screenshot;
  if (this.status === 'SUBMITTED' && !this.submittedAt) this.submittedAt = new Date();
  if ((this.status === 'APPROVED' || this.status === 'CONFIRMED') && !this.approvedAt) {
    this.approvedAt = new Date();
    this.verifiedAt = this.approvedAt;
  }
  next();
});

depositRequestSchema.index({ clientId: 1, createdAt: -1 });
depositRequestSchema.index({ userId: 1, createdAt: -1 });
depositRequestSchema.index({ status: 1, createdAt: -1 });
depositRequestSchema.index({ depositType: 1, createdAt: -1 });
depositRequestSchema.index({ systemType: 1, createdAt: -1 });

const DepositRequest = mongoose.model('DepositRequest', depositRequestSchema);

module.exports = DepositRequest;
