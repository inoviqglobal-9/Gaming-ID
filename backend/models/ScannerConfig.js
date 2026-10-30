const mongoose = require('mongoose');

const scannerVersionSchema = new mongoose.Schema(
  {
    version: { type: Number, required: true },
    scannerName: { type: String, required: true },
    merchantName: { type: String, required: true },
    merchantIdentifier: { type: String, default: '' },
    qrImageUrl: { type: String, default: '' },
    instructions: { type: String, default: '' },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    changedAt: { type: Date, default: Date.now },
    reason: { type: String, default: '' },
  },
  { _id: false }
);

const scannerConfigSchema = new mongoose.Schema(
  {
    scannerId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    scannerName: {
      type: String,
      required: [true, 'Scanner configuration name is required'],
      trim: true,
    },
    merchantName: {
      type: String,
      required: [true, 'Merchant name is required'],
      trim: true,
      index: true,
    },
    merchantIdentifier: {
      type: String,
      trim: true,
      default: '', // PhonePe Store ID, VPA or Terminal ID
    },
    paymentProvider: {
      type: String,
      default: 'PhonePe Business',
      trim: true,
    },
    qrImageUrl: {
      type: String,
      default: '',
    },
    // Backwards compatibility alias for existing code
    assetUrl: {
      type: String,
      default: '',
    },
    paymentPurpose: {
      type: String,
      default: 'Trader Deposit / PayIn',
      trim: true,
    },
    instructions: {
      type: String,
      default: 'Scan this official PhonePe QR code. Verify the merchant name, pay the exact amount, and submit your 12-digit UTR/Reference ID.',
      maxlength: 1000,
    },
    mode: {
      type: String,
      enum: ['LIVE', 'DEMO_ONLY'],
      default: 'LIVE',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['DRAFT', 'PUBLISHED', 'ACTIVE', 'INACTIVE', 'UNPUBLISHED', 'ARCHIVED'],
      default: 'DRAFT',
      required: true,
      index: true,
    },
    authorizationStatus: {
      type: String,
      enum: ['AUTHORIZED', 'PENDING_APPROVAL', 'DEMO_EXEMPT'],
      default: 'AUTHORIZED',
      required: true,
    },
    authorizationDetails: {
      type: String,
      default: 'Authorized PhonePe Merchant Account verified by Admin.',
      maxlength: 500,
    },
    workflowType: {
      type: String,
      enum: ['PAYIN', 'DEPOSIT', 'ALL'],
      default: 'ALL',
      required: true,
    },
    supportedCurrencies: {
      type: [String],
      default: ['INR'],
    },
    isPublished: {
      type: Boolean,
      default: false,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: false,
      index: true,
    },
    version: {
      type: Number,
      default: 1,
    },
    versionHistory: [scannerVersionSchema],
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    walletAddress: {
      type: String,
      trim: true,
      default: '',
    },
    activatedAt: {
      type: Date,
      default: null,
    },
    activatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    deactivatedAt: {
      type: Date,
      default: null,
    },
    deactivatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    archivedAt: {
      type: Date,
      default: null,
    },
    archivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Synchronize qrImageUrl and assetUrl for backward compatibility
scannerConfigSchema.pre('save', function (next) {
  if (this.qrImageUrl && !this.assetUrl) {
    this.assetUrl = this.qrImageUrl;
  } else if (this.assetUrl && !this.qrImageUrl) {
    this.qrImageUrl = this.assetUrl;
  }
  if (this.merchantIdentifier && !this.walletAddress) {
    this.walletAddress = this.merchantIdentifier;
  } else if (this.walletAddress && !this.merchantIdentifier) {
    this.merchantIdentifier = this.walletAddress;
  }
  next();
});

const ScannerConfig = mongoose.model('ScannerConfig', scannerConfigSchema);

module.exports = ScannerConfig;
