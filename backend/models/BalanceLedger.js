const mongoose = require('mongoose');

const balanceLedgerSchema = new mongoose.Schema(
  {
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
    currency: {
      type: String,
      enum: ['INR', 'USDT'],
      required: true,
      index: true,
    },
    entryType: {
      type: String,
      enum: [
        'DEPOSIT_CONFIRMED',
        'PAYIN_CONFIRMED',
        'PAYOUT_DEDUCTED',
        'PAYOUT_REFUND',
        'CRYPTO_DEPOSIT_CONFIRMED',
        'CRYPTO_WITHDRAWAL_DEDUCTED',
        'CRYPTO_WITHDRAWAL_BONUS',
        'ADMIN_ADJUSTMENT',
        'WALLET_CHECK_FEE',
      ],
      required: true,
    },
    amount: {
      type: Number,
      required: true, // Positive for credit, negative for debit
    },
    balanceAfter: {
      type: Number,
      required: true,
    },
    referenceRequestId: {
      type: String,
      required: true,
      index: true,
    },
    notes: {
      type: String,
      default: '',
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate processing of the same request id into the ledger
balanceLedgerSchema.index({ referenceRequestId: 1, entryType: 1 }, { unique: true });

// Static helper to calculate verified available balance
balanceLedgerSchema.statics.calculateAvailableBalance = async function (userId, currency) {
  const latestEntry = await this.findOne({ userId, currency }).sort({ createdAt: -1, _id: -1 });
  return latestEntry ? Number(latestEntry.balanceAfter.toFixed(2)) : 0.00;
};

// Static helper to record an atomic entry with verified duplicate protection
balanceLedgerSchema.statics.recordVerifiedEntry = async function ({
  userId,
  clientId,
  currency,
  entryType,
  amount,
  referenceRequestId,
  notes,
  performedBy,
}) {
  // Check if this reference was already credited/processed
  const existing = await this.findOne({ referenceRequestId, entryType });
  if (existing) {
    throw new Error(`Duplicate entry prevented: reference '${referenceRequestId}' already processed.`);
  }

  // Get current balance
  const currentBalance = await this.calculateAvailableBalance(userId, currency);
  const newBalance = Number((currentBalance + amount).toFixed(2));

  if (newBalance < 0) {
    throw new Error(`Insufficient verified balance for deduction. Current: ${currentBalance}, Required deduction: ${Math.abs(amount)}`);
  }

  const ledgerEntry = new this({
    userId,
    clientId,
    currency,
    entryType,
    amount,
    balanceAfter: newBalance,
    referenceRequestId,
    notes,
    performedBy,
  });

  return ledgerEntry.save();
};

const BalanceLedger = mongoose.model('BalanceLedger', balanceLedgerSchema);

module.exports = BalanceLedger;
