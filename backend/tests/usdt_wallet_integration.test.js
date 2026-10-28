const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const UsdtWallet = require('../models/UsdtWallet');
const WalletAdjustment = require('../models/WalletAdjustment');
const BalanceLedger = require('../models/BalanceLedger');
const Notification = require('../models/Notification');
const { setupTestDB, cleanupTestDB, clearCollections } = require('./setup');

let admin1Cookie;
let admin2Cookie;
let trader1Cookie;
let trader2Cookie;
let trader1Id;
let trader2Id;
let admin1Id;
let admin2Id;

test.before(async () => {
  await setupTestDB();
});

test.after(async () => {
  await cleanupTestDB();
});

test.beforeEach(async () => {
  await clearCollections();

  // Create Admin 1
  const admin1Hash = await User.hashPassword('Admin1Pass#123456');
  const admin1 = await User.create({
    username: 'primary_admin',
    passwordHash: admin1Hash,
    role: 'ADMIN',
    status: 'ACTIVE',
  });
  admin1Id = admin1._id;

  // Create Admin 2 (for independent approval testing)
  const admin2Hash = await User.hashPassword('Admin2Pass#123456');
  const admin2 = await User.create({
    username: 'secondary_admin',
    passwordHash: admin2Hash,
    role: 'ADMIN',
    status: 'ACTIVE',
  });
  admin2Id = admin2._id;

  // Create Trader 1
  const trader1Hash = await User.hashPassword('Trader1Pass#123456');
  const trader1 = await User.create({
    username: 'trader101',
    fullName: 'Trader 101 Pro',
    passwordHash: trader1Hash,
    role: 'TRADER',
    status: 'ACTIVE',
  });
  trader1Id = trader1._id;

  // Create Trader 2
  const trader2Hash = await User.hashPassword('Trader2Pass#123456');
  const trader2 = await User.create({
    username: 'trader102',
    fullName: 'Trader 102 Pro',
    passwordHash: trader2Hash,
    role: 'TRADER',
    status: 'ACTIVE',
  });
  trader2Id = trader2._id;

  // Login Admin 1
  const a1Res = await request(app)
    .post('/api/auth/login')
    .send({ username: 'primary_admin', password: 'Admin1Pass#123456' });
  admin1Cookie = a1Res.headers['set-cookie'][0];

  // Login Admin 2
  const a2Res = await request(app)
    .post('/api/auth/login')
    .send({ username: 'secondary_admin', password: 'Admin2Pass#123456' });
  admin2Cookie = a2Res.headers['set-cookie'][0];

  // Login Trader 1
  const t1Res = await request(app)
    .post('/api/auth/login')
    .send({ username: 'trader101', password: 'Trader1Pass#123456' });
  trader1Cookie = t1Res.headers['set-cookie'][0];

  // Login Trader 2
  const t2Res = await request(app)
    .post('/api/auth/login')
    .send({ username: 'trader102', password: 'Trader2Pass#123456' });
  trader2Cookie = t2Res.headers['set-cookie'][0];
});

test('USDT: Fixed Rate ₹105 arithmetic valuation formula', async () => {
  const wallet = await UsdtWallet.getOrCreate(trader1Id);

  // Helper valuation check
  const testValuation = (usdt) => {
    wallet.availableBalance = usdt.toFixed(6);
    const val = wallet.toValuation(105);
    return Number(val.inrEquivalent);
  };

  assert.strictEqual(testValuation(10), 1050.0);
  assert.strictEqual(testValuation(50), 5250.0);
  assert.strictEqual(testValuation(100), 10500.0);
  assert.strictEqual(testValuation(250), 26250.0);
  assert.strictEqual(testValuation(500), 52500.0);
  assert.strictEqual(testValuation(1000), 105000.0);
});

test('USDT: Authenticated Trader GET /api/trader/wallet/usdt returns exact Phase 14 schema', async () => {
  const res = await request(app)
    .get('/api/trader/wallet/usdt')
    .set('Cookie', trader1Cookie);

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.currency, 'USDT');
  assert.strictEqual(res.body.availableBalance, '0.000000');
  assert.strictEqual(res.body.lockedBalance, '0.000000');
  assert.strictEqual(res.body.totalBalance, '0.000000');
  assert.strictEqual(res.body.exchangeRate.baseCurrency, 'USDT');
  assert.strictEqual(res.body.exchangeRate.quoteCurrency, 'INR');
  assert.strictEqual(res.body.exchangeRate.rate, '105.00');
  assert.strictEqual(res.body.exchangeRate.type, 'FIXED');
  assert.strictEqual(res.body.inrEquivalent, '0.00');
});

test('USDT IDOR: Trader cannot access Admin adjustment endpoints (403 Forbidden)', async () => {
  const res = await request(app)
    .post('/api/admin/wallet-adjustments')
    .set('Cookie', trader1Cookie)
    .send({
      traderId: trader1Id,
      type: 'CREDIT',
      amount: 100,
      reason: 'Hacking attempt',
      referenceId: 'FAKE-999',
    });

  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.success, false);
});

test('USDT: Admin can inspect Trader USDT Wallet via GET /api/admin/traders/:id/wallet/usdt', async () => {
  const res = await request(app)
    .get(`/api/admin/traders/${trader1Id}/wallet/usdt`)
    .set('Cookie', admin1Cookie);

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.trader.username, 'trader101');
  assert.strictEqual(res.body.availableBalance, '0.000000');
  assert.strictEqual(res.body.exchangeRate.rate, '105.00');
  assert.strictEqual(res.body.inrEquivalent, '0.00');
});

test('USDT Adjustments: Admin creates credit request -> PENDING status and balance remains 0 until approved', async () => {
  const res = await request(app)
    .post('/api/admin/wallet-adjustments')
    .set('Cookie', admin1Cookie)
    .send({
      traderId: trader1Id,
      type: 'CREDIT',
      amount: 100,
      reason: 'Verified OTC deposit settlement',
      referenceId: 'OTC-TX-882194',
    });

  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.status, 'PENDING');
  assert.strictEqual(res.body.data.amount, 100);
  assert.strictEqual(res.body.data.inrEquivalent, 10500);

  // Verify trader balance is still 0 before approval
  const traderWallet = await request(app)
    .get('/api/trader/wallet/usdt')
    .set('Cookie', trader1Cookie);
  assert.strictEqual(traderWallet.body.availableBalance, '0.000000');
});

test('USDT Policy: Self-approval is rejected when multiple active administrators exist', async () => {
  // Admin 1 creates credit request
  const createRes = await request(app)
    .post('/api/admin/wallet-adjustments')
    .set('Cookie', admin1Cookie)
    .send({
      traderId: trader1Id,
      type: 'CREDIT',
      amount: 50,
      reason: 'Self approval test',
      referenceId: 'TX-SELF-001',
    });

  const adjId = createRes.body.data.adjustmentId;

  // Admin 1 attempts to approve own request
  const approveRes = await request(app)
    .post(`/api/admin/wallet-adjustments/${adjId}/approve`)
    .set('Cookie', admin1Cookie)
    .send({ decisionNotes: 'Trying to self approve' });

  assert.strictEqual(approveRes.status, 403);
  assert.strictEqual(approveRes.body.success, false);
  assert.match(approveRes.body.message, /Independent approval policy/i);
});

test('USDT Approval: Independent Admin 2 approves credit -> Balance updates to 150 USDT & ₹15,750 valuation', async () => {
  // 1. Initial credit 100 USDT
  const adj1 = await request(app)
    .post('/api/admin/wallet-adjustments')
    .set('Cookie', admin1Cookie)
    .send({
      traderId: trader1Id,
      type: 'CREDIT',
      amount: 100,
      reason: 'First deposit credit',
      referenceId: 'DEP-101-001',
    });

  await request(app)
    .post(`/api/admin/wallet-adjustments/${adj1.body.data.adjustmentId}/approve`)
    .set('Cookie', admin2Cookie)
    .send({ decisionNotes: 'Verified proof of funds' });

  // 2. Second credit 50 USDT (Matching Master Prompt Phase 7 Example)
  const adj2 = await request(app)
    .post('/api/admin/wallet-adjustments')
    .set('Cookie', admin1Cookie)
    .send({
      traderId: trader1Id,
      type: 'CREDIT',
      amount: 50,
      reason: 'Second authorized top-up',
      referenceId: 'DEP-101-002',
    });

  const approveRes = await request(app)
    .post(`/api/admin/wallet-adjustments/${adj2.body.data.adjustmentId}/approve`)
    .set('Cookie', admin2Cookie)
    .send({ decisionNotes: 'Evidence verified by secondary approver' });

  assert.strictEqual(approveRes.status, 200);
  assert.strictEqual(approveRes.body.success, true);
  assert.strictEqual(approveRes.body.data.wallet.availableBalance, '150.000000');
  assert.strictEqual(approveRes.body.data.wallet.inrEquivalent, '15750.00'); // 150 * 105 = 15,750

  // Verify Trader sees 150.000000 USDT and ₹15,750
  const traderWallet = await request(app)
    .get('/api/trader/wallet/usdt')
    .set('Cookie', trader1Cookie);
  assert.strictEqual(traderWallet.body.availableBalance, '150.000000');
  assert.strictEqual(traderWallet.body.inrEquivalent, '15750.00');

  // Verify notification was sent to trader
  const notifs = await Notification.find({ recipientUserId: trader1Id });
  assert.ok(notifs.length > 0);
  assert.ok(notifs.some((n) => n.type === 'USDT_CREDITED' && n.amount === 50));
});

test('USDT Deduction: Negative balance prevented; Deducting 20 USDT from 150 leaves 130 USDT & ₹13,650 valuation', async () => {
  // Setup: Give trader 150 USDT
  await UsdtWallet.creditWallet({
    traderId: trader1Id,
    clientId: 'trader101',
    amount: 150,
    referenceRequestId: 'SETUP-CREDIT',
    notes: 'Initial test setup',
    performedBy: admin1Id,
  });

  // Attempting to deduct 200 USDT (exceeding balance) must be rejected
  const overDebit = await request(app)
    .post('/api/admin/wallet-adjustments')
    .set('Cookie', admin1Cookie)
    .send({
      traderId: trader1Id,
      type: 'DEBIT',
      amount: 200,
      reason: 'Excessive debit test',
      referenceId: 'DEBIT-OVER-001',
    });

  assert.strictEqual(overDebit.status, 400);
  assert.strictEqual(overDebit.body.success, false);
  assert.match(overDebit.body.message, /Insufficient available USDT balance/i);

  // Authorized deduction of 20 USDT (Phase 8 Example: 150 - 20 = 130 USDT = ₹13,650)
  const validDebit = await request(app)
    .post('/api/admin/wallet-adjustments')
    .set('Cookie', admin1Cookie)
    .send({
      traderId: trader1Id,
      type: 'DEBIT',
      amount: 20,
      reason: 'Administrative fee reconciliation',
      referenceId: 'DEBIT-VALID-001',
    });

  assert.strictEqual(validDebit.status, 201);
  const debitAdjId = validDebit.body.data.adjustmentId;

  // Approve debit by independent Admin 2
  const approveDebit = await request(app)
    .post(`/api/admin/wallet-adjustments/${debitAdjId}/approve`)
    .set('Cookie', admin2Cookie)
    .send({ decisionNotes: 'Deduction approved' });

  assert.strictEqual(approveDebit.status, 200);
  assert.strictEqual(approveDebit.body.data.wallet.availableBalance, '130.000000');
  assert.strictEqual(approveDebit.body.data.wallet.inrEquivalent, '13650.00'); // 130 * 105 = 13,650

  // Trader view confirms 130 USDT
  const traderWallet = await request(app)
    .get('/api/trader/wallet/usdt')
    .set('Cookie', trader1Cookie);
  assert.strictEqual(traderWallet.body.availableBalance, '130.000000');
  assert.strictEqual(traderWallet.body.inrEquivalent, '13650.00');
});

test('USDT Rejection: Admin can reject adjustment with mandatory reason and notifies trader', async () => {
  const reqRes = await request(app)
    .post('/api/admin/wallet-adjustments')
    .set('Cookie', admin1Cookie)
    .send({
      traderId: trader1Id,
      type: 'CREDIT',
      amount: 40,
      reason: 'Candidate adjustment',
      referenceId: 'REJECT-ME-01',
    });

  const adjId = reqRes.body.data.adjustmentId;

  // Reject without reason is blocked
  const badReject = await request(app)
    .post(`/api/admin/wallet-adjustments/${adjId}/reject`)
    .set('Cookie', admin2Cookie)
    .send({ reason: '' });
  assert.strictEqual(badReject.status, 400);

  // Reject with valid reason
  const rejectRes = await request(app)
    .post(`/api/admin/wallet-adjustments/${adjId}/reject`)
    .set('Cookie', admin2Cookie)
    .send({ reason: 'Invalid supporting settlement receipt hash' });

  assert.strictEqual(rejectRes.status, 200);
  assert.strictEqual(rejectRes.body.data.status, 'REJECTED');

  // Verify trader received notification
  const notif = await Notification.findOne({
    recipientUserId: trader1Id,
    type: 'ADJUSTMENT_REJECTED',
  });
  assert.ok(notif);
  assert.match(notif.message, /rejected/i);
});

test('USDT Activities: GET /api/admin/activities returns formatted administrative telemetry', async () => {
  const res = await request(app)
    .get('/api/admin/activities')
    .set('Cookie', admin1Cookie);

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.ok(Array.isArray(res.body.data));
  assert.ok(res.body.data.length > 0);
  assert.ok(res.body.data[0].activityId);
  assert.ok(res.body.data[0].description);
});
