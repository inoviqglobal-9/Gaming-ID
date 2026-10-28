const mongoose = require('mongoose');

const payoutRequestSchema = new mongoose.Schema(
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
      required: [true, 'Payout amount is required'],
      min: [1, 'Amount must be greater than zero'],
    },
    currency: {
      type: String,
      enum: ['INR', 'USDT'],
      default: 'INR',
      required: true,
    },
    recipientDetails: {
      accountHolder: {
        type: String,
        required: true,
        trim: true,
      },
      accountNumberMasked: {
        type: String,
        default: '',
      },
      ifscOrUpi: {
        type: String,
        default: '',
        trim: true,
      },
      walletAddressMasked: {
        type: String,
        default: '',
        trim: true,
      },
    },
    status: {
      type: String,
      enum: [
        'ASSIGNED',
        'CLAIMED',
        'PENDING',
        'UNDER_REVIEW',
        'APPROVED',
        'PROCESSING',
        'COMPLETED',
        'REJECTED',
        'FAILED',
        'CANCELLED',
        'EXPIRED',
      ],
      default: 'PENDING',
      index: true,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    assignedAt: {
      type: Date,
      default: null,
    },
    claimedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    assignmentNotes: {
      type: String,
      maxlength: 500,
      default: '',
    },
    adminDecisionNotes: {
      type: String,
      maxlength: 500,
      default: '',
    },
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        ret.payoutId = ret.requestId;
        ret.traderId = ret.userId;
        return ret;
      },
    },
  }
);

payoutRequestSchema.index({ clientId: 1, createdAt: -1 });

const PayoutRequest = mongoose.model('PayoutRequest', payoutRequestSchema);

module.exports = PayoutRequest;
