const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const PayInRequest = require('../models/PayInRequest');
const BalanceLedger = require('../models/BalanceLedger');
const { setupTestDB, cleanupTestDB, clearCollections } = require('./setup');

test.before(async () => {
  await setupTestDB();
});

test.after(async () => {
  await cleanupTestDB();
});

test.beforeEach(async () => {
  await clearCollections();
});

// Helper to create and authenticate a user
const createAndLoginUser = async (username, password, role = 'TRADER') => {
  const passwordHash = await User.hashPassword(password);
  const user = await User.create({
    username,
    passwordHash,
    role,
    status: 'ACTIVE',
    mustChangePassword: false,
  });

  const res = await request(app)
    .post('/api/auth/login')
    .send({ username, password });

  const cookies = res.headers['set-cookie'];
  const token = res.body.token;

  return { user, cookies, token };
};

test('Applications: Trader GET /api/trader/applications returns default 20 limit and empty state', async () => {
  const { cookies } = await createAndLoginUser('trader_apps_01', 'Pass12345!', 'TRADER');

  const res = await request(app)
    .get('/api/trader/applications')
    .set('Cookie', cookies);

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.length, 0);
  assert.strictEqual(res.body.pagination.limit, 20);
  assert.strictEqual(res.body.pagination.total, 0);
  assert.strictEqual(res.body.pagination.from, 0);
  assert.strictEqual(res.body.pagination.to, 0);
});

test('Applications: Trader only sees their own applications (Data Isolation & IDOR Protection)', async () => {
  const trader1 = await createAndLoginUser('trader_alpha', 'Pass12345!', 'TRADER');
  const trader2 = await createAndLoginUser('trader_beta', 'Pass12345!', 'TRADER');

  // Create an application for Trader 1
  const app1 = await PayInRequest.create({
    requestId: 'PIN-100001-1111',
    applicationId: 'PIN-100001-1111',
    orderId: 'ORD-100001',
    userId: trader1.user._id,
    clientId: trader1.user.username,
    amount: 5000,
    currency: 'INR',
    status: 'PENDING',
    expiresAt: new Date(Date.now() + 3600000),
  });

  // Create an application for Trader 2
  const app2 = await PayInRequest.create({
    requestId: 'PIN-200002-2222',
    applicationId: 'PIN-200002-2222',
    orderId: 'ORD-200002',
    userId: trader2.user._id,
    clientId: trader2.user.username,
    amount: 10000,
    currency: 'INR',
    status: 'CONFIRMED',
    expiresAt: new Date(Date.now() + 3600000),
  });

  // Trader 1 queries applications
  const res1 = await request(app)
    .get('/api/trader/applications')
    .set('Cookie', trader1.cookies);

  assert.strictEqual(res1.status, 200);
  assert.strictEqual(res1.body.data.length, 1);
  assert.strictEqual(res1.body.data[0].applicationId, 'PIN-100001-1111');
  assert.strictEqual(res1.body.data[0].amount, 5000);

  // Trader 1 attempts to view Trader 2's application directly
  const resIdor = await request(app)
    .get(`/api/trader/applications/${app2._id}`)
    .set('Cookie', trader1.cookies);

  assert.strictEqual(resIdor.status, 404);
});

test('Applications: Trader CSV Export returns authorized records and text/csv format', async () => {
  const trader = await createAndLoginUser('trader_csv_user', 'Pass12345!', 'TRADER');

  await PayInRequest.create({
    requestId: 'PIN-777001-9999',
    applicationId: 'PIN-777001-9999',
    orderId: 'ORD-777001',
    utr: 'UTR777888999000',
    payerName: 'Rohan Sharma',
    requisite: 'PhonePe Merchant A',
    userId: trader.user._id,
    clientId: trader.user.username,
    amount: 2500,
    currency: 'INR',
    status: 'PENDING',
    expiresAt: new Date(Date.now() + 3600000),
  });

  const res = await request(app)
    .get('/api/trader/applications/export')
    .set('Cookie', trader.cookies);

  assert.strictEqual(res.status, 200);
  assert.ok(res.headers['content-type'].includes('text/csv'));
  assert.ok(res.text.includes('PIN-777001-9999'));
  assert.ok(res.text.includes('ORD-777001'));
  assert.ok(res.text.includes('2500.00'));
});

test('Applications: Admin can view all applications across traders and filter by trader', async () => {
  const admin = await createAndLoginUser('admin_user_01', 'AdminSecret123!', 'ADMIN');
  const traderA = await createAndLoginUser('trader_a_01', 'Pass12345!', 'TRADER');
  const traderB = await createAndLoginUser('trader_b_01', 'Pass12345!', 'TRADER');

  await PayInRequest.create({
    requestId: 'PIN-AAA-01',
    applicationId: 'PIN-AAA-01',
    orderId: 'ORD-AAA-01',
    userId: traderA.user._id,
    clientId: traderA.user.username,
    amount: 1500,
    currency: 'INR',
    status: 'PENDING',
    expiresAt: new Date(Date.now() + 3600000),
  });

  await PayInRequest.create({
    requestId: 'PIN-BBB-02',
    applicationId: 'PIN-BBB-02',
    orderId: 'ORD-BBB-02',
    userId: traderB.user._id,
    clientId: traderB.user.username,
    amount: 3000,
    currency: 'INR',
    status: 'PENDING',
    expiresAt: new Date(Date.now() + 3600000),
  });

  // Admin view all
  const resAll = await request(app)
    .get('/api/admin/applications')
    .set('Cookie', admin.cookies);

  assert.strictEqual(resAll.status, 200);
  assert.strictEqual(resAll.body.data.length, 2);

  // Admin filter by Trader A
  const resFiltered = await request(app)
    .get(`/api/admin/applications?traderId=${traderA.user._id}`)
    .set('Cookie', admin.cookies);

  assert.strictEqual(resFiltered.status, 200);
  assert.strictEqual(resFiltered.body.data.length, 1);
  assert.strictEqual(resFiltered.body.data[0].applicationId, 'PIN-AAA-01');
});

test('Applications: Admin review action CONFIRM performs atomic balance credit', async () => {
  const admin = await createAndLoginUser('super_admin_reviewer', 'AdminPass123!', 'ADMIN');
  const trader = await createAndLoginUser('trader_credited', 'Pass12345!', 'TRADER');

  const appRecord = await PayInRequest.create({
    requestId: 'PIN-CONFIRM-99',
    applicationId: 'PIN-CONFIRM-99',
    orderId: 'ORD-CONFIRM-99',
    utr: 'UTR998877665544',
    userId: trader.user._id,
    clientId: trader.user.username,
    amount: 10000,
    currency: 'INR',
    status: 'PENDING',
    isDemo: false,
    expiresAt: new Date(Date.now() + 3600000),
  });

  // Verify starting balance is 0
  const initialBalance = await BalanceLedger.calculateAvailableBalance(trader.user._id, 'INR');
  assert.strictEqual(initialBalance, 0);

  // Admin reviews and confirms application
  const resReview = await request(app)
    .patch(`/api/admin/applications/${appRecord._id}`)
    .set('Cookie', admin.cookies)
    .send({
      action: 'CONFIRM',
      decisionNotes: 'PhonePe settlement verified against merchant ledger',
    });

  assert.strictEqual(resReview.status, 200);
  assert.strictEqual(resReview.body.success, true);
  assert.strictEqual(resReview.body.data.status, 'CONFIRMED');

  // Verify balance was credited by exactly 10000
  const updatedBalance = await BalanceLedger.calculateAvailableBalance(trader.user._id, 'INR');
  assert.strictEqual(updatedBalance, 10000);

  // Immutability: Attempting to review an already finalized application is rejected
  const resDuplicate = await request(app)
    .patch(`/api/admin/applications/${appRecord._id}`)
    .set('Cookie', admin.cookies)
    .send({ action: 'DECLINE' });

  assert.strictEqual(resDuplicate.status, 400);
  assert.strictEqual(resDuplicate.body.success, false);
});

test('Applications: Trader cannot access Admin applications endpoints (403 Forbidden)', async () => {
  const trader = await createAndLoginUser('regular_trader', 'Pass12345!', 'TRADER');

  const res = await request(app)
    .get('/api/admin/applications')
    .set('Cookie', trader.cookies);

  assert.strictEqual(res.status, 403);
});
