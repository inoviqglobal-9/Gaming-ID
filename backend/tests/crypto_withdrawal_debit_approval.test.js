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
const PayInRequest = require('../models/PayInRequest');
const PayoutRequest = require('../models/PayoutRequest');
const DepositRequest = require('../models/DepositRequest');
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
    username: 'crypto_admin',
    passwordHash: adminHash,
    role: 'ADMIN',
    status: 'ACTIVE',
  });
  adminId = admin._id;

  // Create Trader
  const traderHash = await User.hashPassword('TraderPass#123456');
  const trader = await User.create({
    username: 'trader_vip',
    passwordHash: traderHash,
    role: 'CLIENT',
    status: 'ACTIVE',
  });
  traderId = trader._id;

  // Login admin
  const aRes = await request(app)
    .post('/api/auth/login')
    .send({ username: 'crypto_admin', password: 'AdminPass#123456' });
  adminCookie = aRes.headers['set-cookie'] ? aRes.headers['set-cookie'][0] : '';

  // Login trader
  const tRes = await request(app)
    .post('/api/auth/login')
    .send({ username: 'trader_vip', password: 'TraderPass#123456' });
  traderCookie = tRes.headers['set-cookie'] ? tRes.headers['set-cookie'][0] : '';

  // Seed trader with initial 10,000 USDT balance via BalanceLedger + UsdtWallet
  await UsdtWallet.creditWallet({
    traderId,
    clientId: 'trader_vip',
    amount: 10000,
    entryType: 'ADMIN_ADJUSTMENT',
    systemType: 'CRYPTO',
    referenceRequestId: `INIT-${Date.now()}`,
    notes: 'Initial Seed Balance for Testing',
    performedBy: adminId,
  });
});

test('1. Approved new 100 USDT withdrawal causes exactly 99 USDT total wallet debit', async () => {
  // Trader submits 100 USDT withdrawal
  const res = await request(app)
    .post('/api/crypto/withdrawals')
    .set('Cookie', traderCookie)
    .send({
      amount: 100,
      upiId: 'trader@upi',
    });

  assert.strictEqual(res.status, 201);
  const wdId = res.body.data._id;
  assert.strictEqual(res.body.data.balanceDebitUSDT, 99);
  assert.strictEqual(res.body.data.bonusUSDT, 1);
  assert.strictEqual(res.body.data.requestedUSDT, 100);

  // Check wallet before approval: 99 USDT locked, 9901 available, total 10000
  let wallet = await UsdtWallet.findOne({ traderId });
  assert.strictEqual(parseFloat(wallet.availableBalance.toString()), 9901);
  assert.strictEqual(parseFloat(wallet.lockedBalance.toString()), 99);
  assert.strictEqual(parseFloat(wallet.totalBalance.toString()), 10000);

  // Admin approves withdrawal
  const approveRes = await request(app)
    .post(`/api/crypto/admin/withdrawals/${wdId}/approve`)
    .set('Cookie', adminCookie)
    .send({ notes: 'Approved 100 USDT test' });

  assert.strictEqual(approveRes.status, 200);

  // Check wallet after approval: exactly 99 USDT total debit settled
  wallet = await UsdtWallet.findOne({ traderId });
  assert.strictEqual(parseFloat(wallet.availableBalance.toString()), 9901);
  assert.strictEqual(parseFloat(wallet.lockedBalance.toString()), 0);
  assert.strictEqual(parseFloat(wallet.totalBalance.toString()), 9901);

  // Verify BalanceLedger has the -99 debit entry
  const debitEntry = await BalanceLedger.findOne({
    referenceRequestId: res.body.data.requestId,
    entryType: 'CRYPTO_WITHDRAWAL_DEDUCTED',
  });
  assert.ok(debitEntry, 'Debit entry must exist in BalanceLedger');
  assert.strictEqual(debitEntry.amount, -99);
  assert.strictEqual(debitEntry.balanceAfter, 9901);
});

test('2. Approved new 1000 USDT withdrawal causes exactly 990 USDT total wallet debit with ₹105,000 payout', async () => {
  const res = await request(app)
    .post('/api/crypto/withdrawals')
    .set('Cookie', traderCookie)
    .send({
      amount: 1000,
      upiId: 'trader@upi',
    });

  assert.strictEqual(res.status, 201);
  const wdId = res.body.data._id;
  assert.strictEqual(res.body.data.balanceDebitUSDT, 990);
  assert.strictEqual(res.body.data.bonusUSDT, 10);
  assert.strictEqual(res.body.data.finalInrPayout, 105000);

  // Admin approves withdrawal
  const approveRes = await request(app)
    .post(`/api/crypto/admin/withdrawals/${wdId}/approve`)
    .set('Cookie', adminCookie)
    .send();

  assert.strictEqual(approveRes.status, 200);

  const wallet = await UsdtWallet.findOne({ traderId });
  assert.strictEqual(parseFloat(wallet.availableBalance.toString()), 9010);
  assert.strictEqual(parseFloat(wallet.lockedBalance.toString()), 0);
  assert.strictEqual(parseFloat(wallet.totalBalance.toString()), 9010);
});

test('3. Approved new 3000 USDT withdrawal causes exactly 2970 USDT total wallet debit', async () => {
  const res = await request(app)
    .post('/api/crypto/withdrawals')
    .set('Cookie', traderCookie)
    .send({
      amount: 3000,
      upiId: 'trader@upi',
    });

  assert.strictEqual(res.status, 201);
  const wdId = res.body.data._id;
  assert.strictEqual(res.body.data.balanceDebitUSDT, 2970);
  assert.strictEqual(res.body.data.bonusUSDT, 30);

  const approveRes = await request(app)
    .post(`/api/crypto/admin/withdrawals/${wdId}/approve`)
    .set('Cookie', adminCookie)
    .send();

  assert.strictEqual(approveRes.status, 200);

  const wallet = await UsdtWallet.findOne({ traderId });
  assert.strictEqual(parseFloat(wallet.availableBalance.toString()), 7030);
  assert.strictEqual(parseFloat(wallet.lockedBalance.toString()), 0);
  assert.strictEqual(parseFloat(wallet.totalBalance.toString()), 7030);
});

test('4. Double-clicking Admin Approve does not deduct twice (idempotent rejection)', async () => {
  const res = await request(app)
    .post('/api/crypto/withdrawals')
    .set('Cookie', traderCookie)
    .send({ amount: 1000, upiId: 'trader@upi' });
  const wdId = res.body.data._id;

  // First approval
  const approveRes1 = await request(app)
    .post(`/api/crypto/admin/withdrawals/${wdId}/approve`)
    .set('Cookie', adminCookie)
    .send();
  assert.strictEqual(approveRes1.status, 200);

  // Second approval attempt (should fail cleanly with 400)
  const approveRes2 = await request(app)
    .post(`/api/crypto/admin/withdrawals/${wdId}/approve`)
    .set('Cookie', adminCookie)
    .send();
  assert.strictEqual(approveRes2.status, 400);

  // Balance must still be 9010 (debited only once)
  const wallet = await UsdtWallet.findOne({ traderId });
  assert.strictEqual(parseFloat(wallet.totalBalance.toString()), 9010);
});

test('5. Subsequent payout completion does not double debit', async () => {
  const res = await request(app)
    .post('/api/crypto/withdrawals')
    .set('Cookie', traderCookie)
    .send({ amount: 1000, upiId: 'trader@upi' });
  const wdId = res.body.data._id;

  // Approve
  await request(app)
    .post(`/api/crypto/admin/withdrawals/${wdId}/approve`)
    .set('Cookie', adminCookie)
    .send();

  // Complete payout with UTR
  const compRes = await request(app)
    .post(`/api/crypto/admin/withdrawals/${wdId}/complete`)
    .set('Cookie', adminCookie)
    .send({ payoutReference: 'UTR1234567890' });
  assert.strictEqual(compRes.status, 200);

  // Check wallet remains 9010
  const wallet = await UsdtWallet.findOne({ traderId });
  assert.strictEqual(parseFloat(wallet.totalBalance.toString()), 9010);
});

test('6. Rejected pending withdrawal releases reservation exactly once', async () => {
  const res = await request(app)
    .post('/api/crypto/withdrawals')
    .set('Cookie', traderCookie)
    .send({ amount: 1000, upiId: 'trader@upi' });
  const wdId = res.body.data._id;

  // Reject
  const rejRes = await request(app)
    .post(`/api/crypto/admin/withdrawals/${wdId}/reject`)
    .set('Cookie', adminCookie)
    .send({ reason: 'Invalid UPI QR' });
  assert.strictEqual(rejRes.status, 200);

  // Wallet must be fully restored to 10000 available, 0 locked
  const wallet = await UsdtWallet.findOne({ traderId });
  assert.strictEqual(parseFloat(wallet.availableBalance.toString()), 10000);
  assert.strictEqual(parseFloat(wallet.lockedBalance.toString()), 0);
  assert.strictEqual(parseFloat(wallet.totalBalance.toString()), 10000);

  // Rejecting again should be blocked
  const rejRes2 = await request(app)
    .post(`/api/crypto/admin/withdrawals/${wdId}/reject`)
    .set('Cookie', adminCookie)
    .send({ reason: 'Second reject' });
  assert.strictEqual(rejRes2.status, 400);
});

test('7. Reloading page (syncWithLedger) preserves the exact correct balance', async () => {
  const res = await request(app)
    .post('/api/crypto/withdrawals')
    .set('Cookie', traderCookie)
    .send({ amount: 1000, upiId: 'trader@upi' });
  const wdId = res.body.data._id;

  await request(app)
    .post(`/api/crypto/admin/withdrawals/${wdId}/approve`)
    .set('Cookie', adminCookie)
    .send();

  // Simulate multiple page reloads / syncWithLedger calls
  const syncedWallet1 = await UsdtWallet.syncWithLedger(traderId);
  assert.strictEqual(parseFloat(syncedWallet1.availableBalance.toString()), 9010);
  assert.strictEqual(parseFloat(syncedWallet1.totalBalance.toString()), 9010);

  // Trader calls /api/trader/wallet/usdt
  const wRes = await request(app)
    .get('/api/trader/wallet/usdt')
    .set('Cookie', traderCookie);
  assert.strictEqual(wRes.status, 200);
  assert.strictEqual(parseFloat(wRes.body.availableBalance), 9010);
  assert.strictEqual(parseFloat(wRes.body.totalBalance), 9010);
});

test('8. Existing 3% Crypto Deposit credit is unchanged and preserved', async () => {
  const CryptoPaymentQR = require('../models/CryptoPaymentQR');
  // Create an active QR for crypto deposit
  await CryptoPaymentQR.create({
    qrId: 'CQR-TEST-001',
    walletAddress: 'TX7D7vH3qV8kYq4eR9P4dE8vL3kYq4eR9P',
    network: 'TRC20',
    qrImageUrl: '/uploads/active_qr.png',
    isActive: true,
    uploadedBy: adminId,
  });

  // Trader submits 500 USDT deposit
  const depRes = await request(app)
    .post('/api/crypto/deposits')
    .set('Cookie', traderCookie)
    .field('amount', 500)
    .field('network', 'TRC20')
    .field('txHash', '0xabc123789456def9988');

  assert.strictEqual(depRes.status, 201);
  const depId = depRes.body.data._id;
  assert.strictEqual(depRes.body.data.bonusPercent, 3);
  assert.strictEqual(depRes.body.data.totalCreditUSDT, 515);

  // Admin approves deposit
  const appRes = await request(app)
    .post(`/api/crypto/admin/deposits/${depId}/approve`)
    .set('Cookie', adminCookie)
    .send({ notes: 'Deposit verified' });
  assert.strictEqual(appRes.status, 200);

  // Wallet must now have 10000 + 515 = 10515 USDT
  const wallet = await UsdtWallet.findOne({ traderId });
  assert.strictEqual(parseFloat(wallet.availableBalance.toString()), 10515);
  assert.strictEqual(parseFloat(wallet.totalBalance.toString()), 10515);
});

test('9. UPI Dashboard statistics are completely unaffected by crypto withdrawals', async () => {
  // Create normal PayIn
  await PayInRequest.create({
    requestId: 'PIN-TEST-001',
    userId: traderId,
    clientId: 'trader_vip',
    amount: 5000,
    status: 'CONFIRMED',
    expiresAt: new Date(Date.now() + 3600000),
  });

  // Create & approve crypto withdrawal of 1000 USDT
  const wdRes = await request(app)
    .post('/api/crypto/withdrawals')
    .set('Cookie', traderCookie)
    .send({ amount: 1000, upiId: 'trader@upi' });
  await request(app)
    .post(`/api/crypto/admin/withdrawals/${wdRes.body.data._id}/approve`)
    .set('Cookie', adminCookie)
    .send();

  // Query UPI dashboard summary
  const sumRes = await request(app)
    .get('/api/trader/dashboard/summary')
    .set('Cookie', traderCookie);
  assert.strictEqual(sumRes.status, 200);
  assert.strictEqual(sumRes.body.data.payIn.volume, 5000);
  assert.strictEqual(sumRes.body.data.payOut.volume, 0); // Crypto withdrawal is NOT in PayOut Volume!
  assert.strictEqual(sumRes.body.data.totalVolume, 5000);
});
