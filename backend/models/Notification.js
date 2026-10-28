const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipientUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    recipientClientId: {
      type: String,
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        'PAYMENT_PENDING_VERIFICATION',
        'PAYMENT_CONFIRMED',
        'PAYMENT_NOT_VERIFIED',
        'DEMO_PAYMENT_CONFIRMED',
        'SCANNER_CHANGED',
        'DEPOSIT_CONFIRMED',
        'DEPOSIT_REJECTED',
        'DEPOSIT_SUBMITTED',
        'USDT_CREDITED',
        'USDT_DEBITED',
        'ADJUSTMENT_PENDING',
        'ADJUSTMENT_APPROVED',
        'ADJUSTMENT_REJECTED',
        'CRYPTO_DEPOSIT_SUBMITTED',
        'CRYPTO_DEPOSIT_APPROVED',
        'CRYPTO_DEPOSIT_REJECTED',
        'CRYPTO_WITHDRAWAL_SUBMITTED',
        'CRYPTO_WITHDRAWAL_APPROVED',
        'CRYPTO_WITHDRAWAL_REJECTED',
        'CRYPTO_WITHDRAWAL_PAID',
        'PAYOUT_STATUS_UPDATED',
        'ACCOUNT_STATUS_CHANGED',
        'SYSTEM',
      ],
      default: 'SYSTEM',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    paymentId: {
      type: String,
      default: null,
      index: true,
    },
    amount: {
      type: Number,
      default: null,
    },
    currency: {
      type: String,
      default: 'INR',
    },
    referenceId: {
      type: String,
      default: null,
    },
    confirmedAt: {
      type: Date,
      default: null,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

notificationSchema.index({ recipientUserId: 1, createdAt: -1 });
notificationSchema.index({ recipientUserId: 1, isRead: 1 });

// Helper method to create client notification safely
notificationSchema.statics.sendNotification = async function ({
  recipientUserId,
  recipientClientId,
  type,
  title,
  message,
  paymentId,
  amount,
  currency = 'INR',
  referenceId,
  confirmedAt,
  metadata = {},
}) {
  try {
    return await this.create({
      recipientUserId,
      recipientClientId,
      type,
      title,
      message,
      paymentId,
      amount,
      currency,
      referenceId,
      confirmedAt: confirmedAt || (type === 'PAYMENT_CONFIRMED' ? new Date() : null),
      metadata,
    });
  } catch (err) {
    console.error('[Notification Error] Failed to create notification:', err.message);
  }
};

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
