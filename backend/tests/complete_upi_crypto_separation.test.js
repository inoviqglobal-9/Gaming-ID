const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const UsdtWallet = require('../models/UsdtWallet');
const BalanceLedger = require('../models/BalanceLedger');
const CryptoDepositRequest = require('../models/CryptoDepositRequest');
const CryptoWithdrawalRequest = require('../models/CryptoWithdrawalRequest');
const CryptoPaymentQR = require('../models/CryptoPaymentQR');
const PayInRequest = require('../models/PayInRequest');
const PayoutRequest = require('../models/PayoutRequest');
const DepositRequest = require('../models/DepositRequest');
const DepositConfig = require('../models/DepositConfig');
const { setupTestDB, cleanupTestDB, clearCollections } = require('./setup');

let adminCookie;
let traderCookie;
let traderId;
let adminId;

test.before(async () => {
  await setupTestDB();
});

test.after(async () => {
  await cleanupTestDB();
});

test.beforeEach(async () => {
  await clearCollections();

  // Create Admin
  const adminHash = await User.hashPassword('AdminPass#123456');
  const admin = await User.create({
    username: 'super_admin',
    passwordHash: adminHash,
    role: 'ADMIN',
    status: 'ACTIVE',
  });
  adminId = admin._id;

  // Create Trader
  const traderHash = await User.hashPassword('TraderPass#123456');
  const trader = await User.create({
    username: 'ajay_hooda_05',
    passwordHash: traderHash,
    role: 'CLIENT',
    status: 'ACTIVE',
  });
  traderId = trader._id;

  // Login Admin
  const aRes = await request(app)
    .post('/api/auth/login')
    .send({ username: 'super_admin', password: 'AdminPass#123456' });
  adminCookie = aRes.headers['set-cookie'] ? aRes.headers['set-cookie'][0] : '';

  // Login Trader
  const tRes = await request(app)
    .post('/api/auth/login')
    .send({ username: 'ajay_hooda_05', password: 'TraderPass#123456' });
  traderCookie = tRes.headers['set-cookie'] ? tRes.headers['set-cookie'][0] : '';

  // Seed default deposit settings
  await DepositConfig.getOrCreateDefault();

  // Seed active Crypto QR
  await CryptoPaymentQR.create({
    qrId: 'CQR-TEST-SEED',
    walletAddress: 'TX7D7vH3qV8kYq4eR9P4dE8vL3kYq4eR9P',
    qrImageUrl: '/uploads/official-usdt-trc20-qr.png',
    network: 'TRC20',
    title: 'Official USDT TRC20 Wallet',
    isActive: true,
  });

  // Seed active Normal Scanner
  const ScannerConfig = require('../models/ScannerConfig');
  await ScannerConfig.create({
    scannerId: 'QR-TEST-SEP',
    scannerName: 'Official USDT TRC20 Vault',
    merchantName: 'RisePay Vault',
    merchantIdentifier: 'TPF1ZetizM3m9nnu7xkh2EczsL2fZ6b8Nd',
    walletAddress: 'TPF1ZetizM3m9nnu7xkh2EczsL2fZ6b8Nd',
    qrImageUrl: '/uploads/official-usdt-trc20-qr.png',
    paymentProvider: 'USDT TRC20',
    status: 'ACTIVE',
    isActive: true,
    isPublished: true,
  });
});

test('Scenario 1 & 2: Working Deposit and Security Deposit appear in Normal requests only', async () => {
  // 1. Trader creates a Working Deposit (USDT TRC20)
  const workRes = await request(app)
    .post('/api/trader/deposit-requests')
    .set('Cookie', traderCookie)
    .send({ depositType: 'WORKING_DEPOSIT', amount: 500, currency: 'USDT' });
  assert.strictEqual(workRes.status, 201);
  assert.strictEqual(workRes.body.data.systemType, 'NORMAL');
  assert.strictEqual(workRes.body.data.depositType, 'WORKING_DEPOSIT');

  // Verify it appears in Trader Normal Deposit Requests
  const listRes = await request(app)
    .get('/api/trader/deposit-requests')
    .set('Cookie', traderCookie);
  assert.strictEqual(listRes.status, 200);
  assert.strictEqual(listRes.body.data.length, 1);
  assert.strictEqual(listRes.body.data[0].systemType, 'NORMAL');

  // Verify it does NOT appear in Trader Crypto Transactions
  const cryptoTxRes = await request(app)
    .get('/api/crypto/transactions')
    .set('Cookie', traderCookie);
  assert.strictEqual(cryptoTxRes.status, 200);
  assert.strictEqual(cryptoTxRes.body.data.length, 0);

  // Verify it does NOT appear in Admin Crypto Deposits queue
  const adminCryptoRes = await request(app)
    .get('/api/crypto/admin/deposits')
    .set('Cookie', adminCookie);
  assert.strictEqual(adminCryptoRes.status, 200);
  assert.strictEqual(adminCryptoRes.body.data.length, 0);

  // Verify it appears in Admin Normal Deposits queue
  const adminNormRes = await request(app)
    .get('/api/admin/deposit-requests')
    .set('Cookie', adminCookie);
  assert.strictEqual(adminNormRes.status, 200);
  assert.strictEqual(adminNormRes.body.data.length, 1);
  assert.strictEqual(adminNormRes.body.data[0].systemType, 'NORMAL');
});

test('Scenario 3 & 4: Normal PayIn and Payout affect Normal/UPI statistics only', async () => {
  // Create confirmed PayIn for Trader
  await PayInRequest.create({
    requestId: 'PIN-10001',
    userId: traderId,
    clientId: 'ajay_hooda_05',
    amount: 15000,
    currency: 'INR',
    status: 'CONFIRMED',
    expiresAt: new Date(Date.now() + 3600000),
  });

  // Create completed Payout for Trader
  await PayoutRequest.create({
    requestId: 'POUT-10001',
    userId: traderId,
    clientId: 'ajay_hooda_05',
    amount: 5000,
    currency: 'INR',
    status: 'COMPLETED',
    recipientDetails: {
      accountHolder: 'Ajay Hooda',
      accountOrUpi: 'ajay@okhdfcbank',
      ifscOrBank: 'HDFC0001234',
    },
  });

  // Check UPI Dashboard Summary
  const sumRes = await request(app)
    .get('/api/trader/dashboard/summary?period=7D')
    .set('Cookie', traderCookie);
  assert.strictEqual(sumRes.status, 200);
  assert.strictEqual(sumRes.body.data.payIn.volume, 15000);
  assert.strictEqual(sumRes.body.data.payOut.volume, 5000);
  assert.strictEqual(sumRes.body.data.totalVolume, 20000);
  assert.strictEqual(sumRes.body.data.totalTransactions, 2);

  // Verify Crypto Transactions history is completely untouched
  const cryptoTxRes = await request(app)
    .get('/api/crypto/transactions')
    .set('Cookie', traderCookie);
  assert.strictEqual(cryptoTxRes.status, 200);
  assert.strictEqual(cryptoTxRes.body.data.length, 0);
});

test('Scenario 5, 9 & 12: Crypto Deposit retains exact 3% bonus, updates Crypto subledger only', async () => {
  // Trader creates a 1000 USDT Crypto Deposit
  const depRes = await request(app)
    .post('/api/crypto/deposits')
    .set('Cookie', traderCookie)
    .field('depositAmountUSDT', 1000)
    .field('network', 'TRC20')
    .field('txHash', '4a7b9c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b');
  assert.strictEqual(depRes.status, 201);
  const cryptoDepId = depRes.body.data._id;

  // Base 1000 + 3% bonus = 1030 USDT
  assert.strictEqual(depRes.body.data.depositAmountUSDT, 1000);
  assert.strictEqual(depRes.body.data.bonusPercent, 3);
  assert.strictEqual(depRes.body.data.bonusAmountUSDT, 30);
  assert.strictEqual(depRes.body.data.totalCreditUSDT, 1030);

  // Admin approves Crypto Deposit
  const appRes = await request(app)
    .post(`/api/crypto/admin/deposits/${cryptoDepId}/approve`)
    .set('Cookie', adminCookie)
    .send({ notes: 'Verified on TronScan' });
  assert.strictEqual(appRes.status, 200);

  // Verify Crypto Dashboard wallet endpoint returns exactly 1030 USDT
  const cryptoWalletRes = await request(app)
    .get('/api/crypto/wallet')
    .set('Cookie', traderCookie);
  assert.strictEqual(cryptoWalletRes.status, 200);
  assert.strictEqual(parseFloat(cryptoWalletRes.body.availableBalance), 1030);
  assert.strictEqual(parseFloat(cryptoWalletRes.body.inrEquivalent), 1030 * 105);

  // Verify UPI Dashboard USDT wallet returns 0 (since no normal deposits have been made)
  const normWalletRes = await request(app)
    .get('/api/trader/wallet/usdt?module=NORMAL')
    .set('Cookie', traderCookie);
  assert.strictEqual(normWalletRes.status, 200);
  assert.strictEqual(parseFloat(normWalletRes.body.availableBalance), 0);

  // Verify Normal Deposit Requests list does NOT contain this crypto deposit
  const normListRes = await request(app)
    .get('/api/trader/deposit-requests')
    .set('Cookie', traderCookie);
  assert.strictEqual(normListRes.status, 200);
  assert.strictEqual(normListRes.body.data.length, 0);

  // Verify Admin Normal Deposits list does NOT contain this crypto deposit
  const adminNormListRes = await request(app)
    .get('/api/admin/deposit-requests')
    .set('Cookie', adminCookie);
  assert.strictEqual(adminNormListRes.status, 200);
  assert.strictEqual(adminNormListRes.body.data.length, 0);
});

test('Scenario 6, 10 & 11: Crypto Withdrawal (+1% benefit, 99% debit) affects Crypto only and debits exactly once', async () => {
  // Give trader 2000 USDT via Crypto deposit
  const dep = await CryptoDepositRequest.create({
    requestId: 'CDP-SEED-01',
    traderId,
    traderUsername: 'ajay_hooda_05',
    depositAmountUSDT: 2000,
    usdtAmount: 2000,
    bonusPercent: 3,
    bonusAmountUSDT: 60,
    totalCreditUSDT: 2060,
    status: 'COMPLETED',
  });
  await UsdtWallet.creditWallet({
    traderId,
    clientId: 'ajay_hooda_05',
    amount: 2060,
    entryType: 'CRYPTO_DEPOSIT_CONFIRMED',
    systemType: 'CRYPTO',
    referenceRequestId: dep.requestId,
    notes: 'Test seed credit',
    performedBy: adminId,
  });

  // Trader requests 1000 USDT withdrawal (+1% bonus benefit -> 990 USDT debit)
  const wdRes = await request(app)
    .post('/api/crypto/withdrawals')
    .set('Cookie', traderCookie)
    .send({ amount: 1000, upiId: 'trader@okhdfcbank' });
  assert.strictEqual(wdRes.status, 201);
  const withdrawalId = wdRes.body.data._id;
  assert.strictEqual(wdRes.body.data.balanceDebitUSDT, 990);
  assert.strictEqual(wdRes.body.data.bonusUSDT, 10);
  assert.strictEqual(wdRes.body.data.payoutINR, 105000);

  // Before approval: 990 USDT is locked, 1070 available in Crypto
  let cryptoWallet = await request(app).get('/api/crypto/wallet').set('Cookie', traderCookie);
  assert.strictEqual(parseFloat(cryptoWallet.body.availableBalance), 1070);
  assert.strictEqual(parseFloat(cryptoWallet.body.lockedBalance), 990);

  // Admin approves withdrawal
  const appRes = await request(app)
    .post(`/api/crypto/admin/withdrawals/${withdrawalId}/approve`)
    .set('Cookie', adminCookie)
    .send({ notes: 'Admin Approved Payout' });
  assert.strictEqual(appRes.status, 200);

  // After approval: locked balance is cleared, 1070 available in Crypto
  cryptoWallet = await request(app).get('/api/crypto/wallet').set('Cookie', traderCookie);
  assert.strictEqual(parseFloat(cryptoWallet.body.availableBalance), 1070);
  assert.strictEqual(parseFloat(cryptoWallet.body.lockedBalance), 0);

  // Verify Normal Payout volume is COMPLETELY 0 (not polluted by crypto withdrawal)
  const sumRes = await request(app)
    .get('/api/trader/dashboard/summary?period=7D')
    .set('Cookie', traderCookie);
  assert.strictEqual(sumRes.body.data.payOut.volume, 0);

  // Verify double approval is rejected
  const dupRes = await request(app)
    .post(`/api/crypto/admin/withdrawals/${withdrawalId}/approve`)
    .set('Cookie', adminCookie)
    .send({ notes: 'Double approve attempt' });
  assert.strictEqual(dupRes.status, 400);
});

test('Scenario 13, 14 & 15: Subledger separation and custody wallet reconciliation', async () => {
  // 1. Trader deposits 1000 USDT via Normal Working Deposit
  const normDep = await DepositRequest.create({
    requestId: 'TDR-NORM-100',
    userId: traderId,
    clientId: 'ajay_hooda_05',
    depositType: 'WORKING_DEPOSIT',
    systemType: 'NORMAL',
    amount: 1000,
    currency: 'USDT',
    status: 'APPROVED',
  });
  await BalanceLedger.recordVerifiedEntry({
    userId: traderId,
    clientId: 'ajay_hooda_05',
    currency: 'USDT',
    entryType: 'DEPOSIT_CONFIRMED',
    systemType: 'NORMAL',
    amount: 1000,
    referenceRequestId: normDep.requestId,
    notes: 'Normal Working Deposit Confirmed',
    performedBy: adminId,
  });

  // 2. Trader deposits 500 USDT via Crypto Deposit (+3% bonus = 515 USDT)
  const cryptoDep = await CryptoDepositRequest.create({
    requestId: 'CDP-CRYPTO-500',
    traderId,
    traderUsername: 'ajay_hooda_05',
    depositAmountUSDT: 500,
    usdtAmount: 500,
    bonusPercent: 3,
    bonusAmountUSDT: 15,
    totalCreditUSDT: 515,
    status: 'COMPLETED',
  });
  await BalanceLedger.recordVerifiedEntry({
    userId: traderId,
    clientId: 'ajay_hooda_05',
    currency: 'USDT',
    entryType: 'CRYPTO_DEPOSIT_CONFIRMED',
    systemType: 'CRYPTO',
    amount: 515,
    referenceRequestId: cryptoDep.requestId,
    notes: 'Crypto Deposit +3% Bonus Confirmed',
    performedBy: adminId,
  });

  // 3. Query Normal Wallet Subledger (UPI Dashboard)
  const normWallet = await request(app)
    .get('/api/trader/wallet/usdt?module=NORMAL')
    .set('Cookie', traderCookie);
  assert.strictEqual(normWallet.status, 200);
  assert.strictEqual(parseFloat(normWallet.body.availableBalance), 1000);
  assert.strictEqual(parseFloat(normWallet.body.inrEquivalent), 1000 * 105);

  // 4. Query Crypto Wallet Subledger (Crypto Dashboard)
  const cryptoWallet = await request(app)
    .get('/api/crypto/wallet')
    .set('Cookie', traderCookie);
  assert.strictEqual(cryptoWallet.status, 200);
  assert.strictEqual(parseFloat(cryptoWallet.body.availableBalance), 515);
  assert.strictEqual(parseFloat(cryptoWallet.body.inrEquivalent), 515 * 105);

  // 5. Total Custody Wallet Reconciliation
  const custodyWallet = await UsdtWallet.syncWithLedger(traderId);
  const totalCustodyAvailable = parseFloat(custodyWallet.availableBalance.toString());
  assert.strictEqual(totalCustodyAvailable, 1515);
  assert.strictEqual(
    parseFloat(normWallet.body.availableBalance) + parseFloat(cryptoWallet.body.availableBalance),
    totalCustodyAvailable
  );
});

test('Scenario 7 & 8: Admin queues isolation', async () => {
  // Create 1 pending Normal deposit
  await DepositRequest.create({
    requestId: 'TDR-PENDING-01',
    userId: traderId,
    clientId: 'ajay_hooda_05',
    depositType: 'WORKING_DEPOSIT',
    systemType: 'NORMAL',
    amount: 800,
    currency: 'USDT',
    status: 'SUBMITTED',
  });

  // Create 1 pending Crypto deposit
  await CryptoDepositRequest.create({
    requestId: 'CDP-PENDING-01',
    traderId,
    traderUsername: 'ajay_hooda_05',
    depositAmountUSDT: 900,
    usdtAmount: 900,
    bonusPercent: 3,
    bonusAmountUSDT: 27,
    totalCreditUSDT: 927,
    status: 'PENDING_VERIFICATION',
  });

  // Admin Normal Deposits Queue must have ONLY 1 item (TDR-PENDING-01)
  const normAdminRes = await request(app)
    .get('/api/admin/deposit-requests')
    .set('Cookie', adminCookie);
  assert.strictEqual(normAdminRes.body.data.length, 1);
  assert.strictEqual(normAdminRes.body.data[0].requestId, 'TDR-PENDING-01');

  // Admin Crypto Deposits Queue must have ONLY 1 item (CDP-PENDING-01)
  const cryptoAdminRes = await request(app)
    .get('/api/crypto/admin/deposits')
    .set('Cookie', adminCookie);
  assert.strictEqual(cryptoAdminRes.body.data.length, 1);
  assert.strictEqual(cryptoAdminRes.body.data[0].requestId, 'CDP-PENDING-01');

  // Admin Dashboard Pending Summary counts normal deposits only
  const statsRes = await request(app)
    .get('/api/admin/analytics?days=7')
    .set('Cookie', adminCookie);
  assert.strictEqual(statsRes.body.analytics.pendingSummary.deposits, 1);
});
