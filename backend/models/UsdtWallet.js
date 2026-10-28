const mongoose = require('mongoose');
const { config } = require('../config/env');
const BalanceLedger = require('./BalanceLedger');

const usdtWalletSchema = new mongoose.Schema(
  {
    traderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Trader ID is required'],
      unique: true,
      index: true,
    },
    currency: {
      type: String,
      default: 'USDT',
      enum: ['USDT'],
      required: true,
    },
    availableBalance: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.000000'),
      required: true,
    },
    lockedBalance: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.000000'),
      required: true,
    },
    totalBalance: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.000000'),
      required: true,
    },
    walletStatus: {
      type: String,
      enum: ['ACTIVE', 'FROZEN', 'SUSPENDED'],
      default: 'ACTIVE',
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    optimisticConcurrency: true, // Prevent concurrent update conflicts
  }
);

// Format helper to ensure 6-decimal representation for USDT
const toFixed6 = (num) => {
  const n = typeof num === 'string' ? parseFloat(num) : Number(num);
  return (isNaN(n) ? 0 : n).toFixed(6);
};

// Format helper for 2-decimal INR currency calculation
const toFixed2 = (num) => {
  const n = typeof num === 'string' ? parseFloat(num) : Number(num);
  return (isNaN(n) ? 0 : n).toFixed(2);
};

// Method to format full valuation object with Fixed Rate ₹105
usdtWalletSchema.methods.toValuation = function (overrideRate) {
  const rate = overrideRate ? Number(overrideRate) : Number(config.usdtInrRate || 105.0);
  const availStr = this.availableBalance ? this.availableBalance.toString() : '0.000000';
  const lockedStr = this.lockedBalance ? this.lockedBalance.toString() : '0.000000';
  const totalStr = this.totalBalance ? this.totalBalance.toString() : '0.000000';

  const availNum = parseFloat(availStr) || 0;
  const lockedNum = parseFloat(lockedStr) || 0;
  const totalNum = parseFloat(totalStr) || (availNum + lockedNum);

  // Exact display-only calculation: INR Equivalent = Available USDT Balance * 105
  const inrEquivalent = toFixed2(availNum * rate);

  return {
    success: true,
    walletId: this._id,
    traderId: this.traderId,
    currency: 'USDT',
    availableBalance: toFixed6(availNum),
    lockedBalance: toFixed6(lockedNum),
    totalBalance: toFixed6(totalNum),
    walletStatus: this.walletStatus,
    exchangeRate: {
      baseCurrency: 'USDT',
      quoteCurrency: 'INR',
      rate: toFixed2(rate),
      type: 'FIXED',
      label: 'Fixed Platform Rate',
    },
    inrEquivalent,
    updatedAt: this.updatedAt,
  };
};

// Static helper to get or create legitimate USDT wallet for a trader
usdtWalletSchema.statics.getOrCreate = async function (traderId) {
  let wallet = await this.findOne({ traderId });
  if (wallet) {
    return wallet;
  }

  // Check if ledger already contains verified USDT balance for this user
  const ledgerUsdtBalance = await BalanceLedger.calculateAvailableBalance(traderId, 'USDT');
  const initialBal = Math.max(0, ledgerUsdtBalance || 0);

  try {
    wallet = await this.create({
      traderId,
      currency: 'USDT',
      availableBalance: mongoose.Types.Decimal128.fromString(toFixed6(initialBal)),
      lockedBalance: mongoose.Types.Decimal128.fromString('0.000000'),
      totalBalance: mongoose.Types.Decimal128.fromString(toFixed6(initialBal)),
      walletStatus: 'ACTIVE',
    });
    return wallet;
  } catch (err) {
    // In case of race condition during concurrent create, fetch existing
    if (err.code === 11000) {
      return this.findOne({ traderId });
    }
    throw err;
  }
};

// Static helper to sync wallet balance with BalanceLedger
usdtWalletSchema.statics.syncWithLedger = async function (traderId) {
  const wallet = await this.getOrCreate(traderId);
  const ledgerBalance = await BalanceLedger.calculateAvailableBalance(traderId, 'USDT');
  const lockedNum = parseFloat(wallet.lockedBalance.toString()) || 0;
  const availNum = Math.max(0, ledgerBalance);
  const totalNum = availNum + lockedNum;

  wallet.availableBalance = mongoose.Types.Decimal128.fromString(toFixed6(availNum));
  wallet.totalBalance = mongoose.Types.Decimal128.fromString(toFixed6(totalNum));
  await wallet.save();
  return wallet;
};

// Static helper to credit wallet atomically with ledger protection
// Static helper to credit wallet atomically with ledger protection
usdtWalletSchema.statics.creditWallet = async function ({
  traderId,
  clientId,
  amount,
  entryType = 'ADMIN_ADJUSTMENT',
  referenceRequestId,
  notes,
  performedBy,
}) {
  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error('Credit amount must be greater than zero.');
  }

  const wallet = await this.getOrCreate(traderId);
  if (wallet.walletStatus !== 'ACTIVE') {
    throw new Error(`Wallet is ${wallet.walletStatus}. Operations restricted.`);
  }

  // 1. Record verified entry in BalanceLedger
  await BalanceLedger.recordVerifiedEntry({
    userId: traderId,
    clientId,
    currency: 'USDT',
    entryType: entryType || 'ADMIN_ADJUSTMENT',
    amount: numAmount,
    referenceRequestId,
    notes: notes || 'Admin Authorized USDT Credit',
    performedBy,
  });

  // 2. Update wallet Decimal128 balances
  const curAvail = parseFloat(wallet.availableBalance.toString()) || 0;
  const curLocked = parseFloat(wallet.lockedBalance.toString()) || 0;
  const newAvail = curAvail + numAmount;
  const newTotal = newAvail + curLocked;

  wallet.availableBalance = mongoose.Types.Decimal128.fromString(toFixed6(newAvail));
  wallet.totalBalance = mongoose.Types.Decimal128.fromString(toFixed6(newTotal));
  await wallet.save();

  return wallet;
};

// Static helper to reserve balance for pending withdrawal (locks available USDT)
usdtWalletSchema.statics.reserveBalance = async function ({ traderId, amount }) {
  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error('Reserve amount must be greater than zero.');
  }

  const wallet = await this.getOrCreate(traderId);
  if (wallet.walletStatus !== 'ACTIVE') {
    throw new Error(`Wallet is ${wallet.walletStatus}. Operations restricted.`);
  }

  const curAvail = parseFloat(wallet.availableBalance.toString()) || 0;
  if (curAvail < numAmount) {
    throw new Error(
      `Insufficient available USDT balance. Available: ${curAvail.toFixed(6)} USDT, Requested: ${numAmount.toFixed(6)} USDT`
    );
  }

  const curLocked = parseFloat(wallet.lockedBalance.toString()) || 0;
  const newAvail = Math.max(0, curAvail - numAmount);
  const newLocked = curLocked + numAmount;
  const newTotal = newAvail + newLocked;

  wallet.availableBalance = mongoose.Types.Decimal128.fromString(toFixed6(newAvail));
  wallet.lockedBalance = mongoose.Types.Decimal128.fromString(toFixed6(newLocked));
  wallet.totalBalance = mongoose.Types.Decimal128.fromString(toFixed6(newTotal));
  await wallet.save();

  return wallet;
};

// Static helper to release reserved balance if a withdrawal is rejected/cancelled
usdtWalletSchema.statics.releaseReservedBalance = async function ({ traderId, amount }) {
  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error('Release amount must be greater than zero.');
  }

  const wallet = await this.getOrCreate(traderId);
  const curAvail = parseFloat(wallet.availableBalance.toString()) || 0;
  const curLocked = parseFloat(wallet.lockedBalance.toString()) || 0;
  const releaseAmt = Math.min(curLocked, numAmount);
  const newAvail = curAvail + releaseAmt;
  const newLocked = Math.max(0, curLocked - releaseAmt);
  const newTotal = newAvail + newLocked;

  wallet.availableBalance = mongoose.Types.Decimal128.fromString(toFixed6(newAvail));
  wallet.lockedBalance = mongoose.Types.Decimal128.fromString(toFixed6(newLocked));
  wallet.totalBalance = mongoose.Types.Decimal128.fromString(toFixed6(newTotal));
  await wallet.save();

  return wallet;
};

// Static helper to finalize debit of reserved balance after payout verification
usdtWalletSchema.statics.finalizeDebitReservedBalance = async function ({
  traderId,
  clientId,
  amount,
  referenceRequestId,
  notes,
  performedBy,
}) {
  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error('Debit amount must be greater than zero.');
  }

  const wallet = await this.getOrCreate(traderId);
  const curAvail = parseFloat(wallet.availableBalance.toString()) || 0;
  const curLocked = parseFloat(wallet.lockedBalance.toString()) || 0;
  if (curLocked < numAmount) {
    throw new Error(
      `Insufficient locked USDT balance for debit. Locked: ${curLocked.toFixed(6)} USDT, Debit: ${numAmount.toFixed(6)} USDT`
    );
  }

  // 1. Record verified debit entry in BalanceLedger (amount is negative)
  await BalanceLedger.recordVerifiedEntry({
    userId: traderId,
    clientId,
    currency: 'USDT',
    entryType: 'CRYPTO_WITHDRAWAL_DEDUCTED',
    amount: -numAmount,
    referenceRequestId,
    notes: notes || 'Crypto Withdrawal Payout Completed',
    performedBy,
  });

  // 2. Decrement locked and total balances
  const newLocked = Math.max(0, curLocked - numAmount);
  const newTotal = curAvail + newLocked;

  wallet.lockedBalance = mongoose.Types.Decimal128.fromString(toFixed6(newLocked));
  wallet.totalBalance = mongoose.Types.Decimal128.fromString(toFixed6(newTotal));
  await wallet.save();

  return wallet;
};

// Static helper to debit wallet atomically with ledger protection
usdtWalletSchema.statics.debitWallet = async function ({
  traderId,
  clientId,
  amount,
  entryType = 'ADMIN_ADJUSTMENT',
  referenceRequestId,
  notes,
  performedBy,
}) {
  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error('Debit amount must be greater than zero.');
  }

  const wallet = await this.getOrCreate(traderId);
  if (wallet.walletStatus !== 'ACTIVE') {
    throw new Error(`Wallet is ${wallet.walletStatus}. Operations restricted.`);
  }

  const curAvail = parseFloat(wallet.availableBalance.toString()) || 0;
  if (curAvail < numAmount) {
    throw new Error(
      `Insufficient available USDT balance for deduction. Available: ${curAvail.toFixed(6)} USDT, Requested: ${numAmount.toFixed(6)} USDT`
    );
  }

  // 1. Record verified debit entry in BalanceLedger (amount is negative)
  await BalanceLedger.recordVerifiedEntry({
    userId: traderId,
    clientId,
    currency: 'USDT',
    entryType: entryType || 'ADMIN_ADJUSTMENT',
    amount: -numAmount,
    referenceRequestId,
    notes: notes || 'Admin Authorized USDT Debit',
    performedBy,
  });

  // 2. Update wallet Decimal128 balances
  const curLocked = parseFloat(wallet.lockedBalance.toString()) || 0;
  const newAvail = Math.max(0, curAvail - numAmount);
  const newTotal = newAvail + curLocked;

  wallet.availableBalance = mongoose.Types.Decimal128.fromString(toFixed6(newAvail));
  wallet.totalBalance = mongoose.Types.Decimal128.fromString(toFixed6(newTotal));
  await wallet.save();

  return wallet;
};


const UsdtWallet = mongoose.model('UsdtWallet', usdtWalletSchema);

module.exports = UsdtWallet;
