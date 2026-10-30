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
        'SECURITY_DEPOSIT_CONFIRMED',
        'SECURITY_DEPOSIT_REFUND',
        'CRYPTO_DEPOSIT_CONFIRMED',
        'CRYPTO_WITHDRAWAL_DEDUCTED',
        'CRYPTO_WITHDRAWAL_BONUS',
        'ADMIN_ADJUSTMENT',
        'WALLET_CHECK_FEE',
      ],
      required: true,
    },
    systemType: {
      type: String,
      enum: ['NORMAL', 'CRYPTO'],
      default: function () {
        return (this.entryType && this.entryType.startsWith('CRYPTO_')) ? 'CRYPTO' : 'NORMAL';
      },
      index: true,
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

// Static helper to calculate module-specific verified balance
balanceLedgerSchema.statics.calculateSubledgerBalance = async function (userId, currency, systemType) {
  if (!systemType || systemType === 'ALL') {
    return this.calculateAvailableBalance(userId, currency);
  }

  const uId = userId instanceof mongoose.Types.ObjectId ? userId : new mongoose.Types.ObjectId(userId);
  const match = { userId: uId, currency };

  if (systemType === 'NORMAL') {
    match.systemType = { $ne: 'CRYPTO' };
    match.entryType = {
      $nin: [
        'CRYPTO_DEPOSIT_CONFIRMED',
        'CRYPTO_WITHDRAWAL_DEDUCTED',
        'CRYPTO_WITHDRAWAL_BONUS',
        'SECURITY_DEPOSIT_CONFIRMED',
        'SECURITY_DEPOSIT_REFUND',
      ],
    };
  } else if (systemType === 'CRYPTO') {
    match.$or = [
      { systemType: 'CRYPTO' },
      { entryType: { $in: ['CRYPTO_DEPOSIT_CONFIRMED', 'CRYPTO_WITHDRAWAL_DEDUCTED', 'CRYPTO_WITHDRAWAL_BONUS'] } },
    ];
    match.entryType = {
      $nin: ['SECURITY_DEPOSIT_CONFIRMED', 'SECURITY_DEPOSIT_REFUND'],
    };
  } else {
    match.systemType = systemType;
  }

  const result = await this.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);

  return result.length > 0 ? Number(Math.max(0, result[0].total).toFixed(6)) : 0.00;
};

// Static helper to calculate verified security deposit balance (held and segregated from spendable wallet)
balanceLedgerSchema.statics.calculateSecurityDepositBalance = async function (userId, currency = 'USDT') {
  const uId = userId instanceof mongoose.Types.ObjectId ? userId : new mongoose.Types.ObjectId(userId);
  const result = await this.aggregate([
    {
      $match: {
        userId: uId,
        currency,
        entryType: { $in: ['SECURITY_DEPOSIT_CONFIRMED', 'SECURITY_DEPOSIT_REFUND'] },
      },
    },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);

  return result.length > 0 ? Number(Math.max(0, result[0].total).toFixed(6)) : 0.00;
};

// Static helper to calculate verified available balance
balanceLedgerSchema.statics.calculateAvailableBalance = async function (userId, currency, systemType) {
  if (systemType && systemType !== 'ALL') {
    return this.calculateSubledgerBalance(userId, currency, systemType);
  }
  const latestEntry = await this.findOne({
    userId,
    currency,
    entryType: { $nin: ['SECURITY_DEPOSIT_CONFIRMED', 'SECURITY_DEPOSIT_REFUND'] },
  }).sort({ createdAt: -1, _id: -1 });
  return latestEntry ? Number(latestEntry.balanceAfter.toFixed(2)) : 0.00;
};

// Static helper to record an atomic entry with verified duplicate protection
balanceLedgerSchema.statics.recordVerifiedEntry = async function ({
  userId,
  clientId,
  currency,
  entryType,
  systemType,
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

  // Security deposits are segregated and do NOT inflate available spendable balanceAfter
  const isSecurity =
    entryType === 'SECURITY_DEPOSIT_CONFIRMED' || entryType === 'SECURITY_DEPOSIT_REFUND';

  // Get current spendable balance
  const currentBalance = await this.calculateAvailableBalance(userId, currency);
  const newBalance = isSecurity
    ? currentBalance
    : Number((currentBalance + amount).toFixed(2));

  if (!isSecurity && newBalance < 0) {
    throw new Error(`Insufficient verified balance for deduction. Current: ${currentBalance}, Required deduction: ${Math.abs(amount)}`);
  }

  const inferredSystemType =
    systemType || (entryType && entryType.startsWith('CRYPTO_') ? 'CRYPTO' : 'NORMAL');

  const ledgerEntry = new this({
    userId,
    clientId,
    currency,
    entryType,
    systemType: inferredSystemType,
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
