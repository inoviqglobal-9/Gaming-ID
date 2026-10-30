const { connectDB } = require('../config/db');
const DepositRequest = require('../models/DepositRequest');
const CryptoDepositRequest = require('../models/CryptoDepositRequest');
const CryptoWithdrawalRequest = require('../models/CryptoWithdrawalRequest');
const BalanceLedger = require('../models/BalanceLedger');
const UsdtWallet = require('../models/UsdtWallet');
const User = require('../models/User');

async function run() {
  await connectDB();

  console.log('--- USERS ---');
  const users = await User.find({ role: { $in: ['CLIENT', 'TRADER'] } }).lean();
  console.log(users.map(u => ({ id: u._id.toString(), username: u.username, role: u.role, status: u.status })));

  console.log('\n--- NORMAL DEPOSIT REQUESTS (DepositRequest) ---');
  const normalDeposits = await DepositRequest.find().sort({ createdAt: -1 }).lean();
  console.log(normalDeposits.map(d => ({
    requestId: d.requestId,
    clientId: d.clientId,
    depositType: d.depositType,
    systemType: d.systemType,
    amount: d.amount,
    currency: d.currency,
    status: d.status,
    verification: d.verification,
    approvedAt: d.approvedAt,
    createdAt: d.createdAt,
  })));

  console.log('\n--- CRYPTO DEPOSIT REQUESTS (CryptoDepositRequest) ---');
  const cryptoDeposits = await CryptoDepositRequest.find().sort({ createdAt: -1 }).lean();
  console.log(cryptoDeposits.map(d => ({
    requestId: d.requestId,
    traderUsername: d.traderUsername,
    systemType: d.systemType,
    depositAmountUSDT: d.depositAmountUSDT,
    usdtAmount: d.usdtAmount,
    bonusPercent: d.bonusPercent,
    bonusAmountUSDT: d.bonusAmountUSDT,
    totalCreditUSDT: d.totalCreditUSDT,
    status: d.status,
    verifiedAt: d.verifiedAt,
    approvedAt: d.approvedAt,
    createdAt: d.createdAt,
  })));

  console.log('\n--- CRYPTO WITHDRAWALS (CryptoWithdrawalRequest) ---');
  const withdrawals = await CryptoWithdrawalRequest.find().sort({ createdAt: -1 }).lean();
  console.log(withdrawals.map(w => ({
    requestId: w.requestId,
    traderUsername: w.traderUsername,
    requestedAmountUSDT: w.requestedAmountUSDT,
    debitAmountUSDT: w.debitAmountUSDT,
    bonusBenefitUSDT: w.bonusBenefitUSDT,
    finalInrPayout: w.finalInrPayout,
    status: w.status,
    ledgerReferenceId: w.ledgerReferenceId,
    createdAt: w.createdAt,
  })));

  console.log('\n--- USDT WALLETS ---');
  const wallets = await UsdtWallet.find().lean();
  console.log(wallets.map(w => ({
    traderId: w.traderId.toString(),
    availableBalance: w.availableBalance ? w.availableBalance.toString() : '0',
    lockedBalance: w.lockedBalance ? w.lockedBalance.toString() : '0',
    totalBalance: w.totalBalance ? w.totalBalance.toString() : '0',
    walletStatus: w.walletStatus,
    updatedAt: w.updatedAt,
  })));

  console.log('\n--- BALANCE LEDGER (Recent 20 entries) ---');
  const ledgers = await BalanceLedger.find().sort({ createdAt: -1 }).limit(20).lean();
  console.log(ledgers.map(l => ({
    id: l._id.toString(),
    clientId: l.clientId,
    currency: l.currency,
    entryType: l.entryType,
    systemType: l.systemType,
    amount: l.amount,
    balanceAfter: l.balanceAfter,
    referenceRequestId: l.referenceRequestId,
    createdAt: l.createdAt,
  })));

  process.exit(0);
}

run().catch(err => {
  console.error('[Inspect Error]:', err);
  process.exit(1);
});
