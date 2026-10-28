const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const Requisite = require('../models/Requisite');
const RequisiteConfig = require('../models/RequisiteConfig');
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

// 1. Trader Summary
test('Requisites: GET /api/trader/requisites/summary returns correct summary counts', async () => {
  const { cookies } = await createAndLoginUser('trader_req_01', 'Pass12345!', 'TRADER');

  const res = await request(app)
    .get('/api/trader/requisites/summary')
    .set('Cookie', cookies);

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.totalRequisites, 0);
  assert.strictEqual(res.body.data.active, 0);
  assert.strictEqual(res.body.data.totalDailyLimit, 0);
});

// 2. Create UPI Requisite
test('Requisites: Trader POST /api/trader/requisites creates UPI requisite with defaults (Inactive, Pending Review, PayIn OFF)', async () => {
  const { cookies } = await createAndLoginUser('trader_req_02', 'Pass12345!', 'TRADER');

  const res = await request(app)
    .post('/api/trader/requisites')
    .set('Cookie', cookies)
    .send({
      type: 'UPI',
      accountHolderName: 'Ganesh Kumar',
      upiId: 'ganesh@upi',
      bankName: 'State Bank of India',
      dailyLimit: 500000,
    });

  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.success, true);
  assert.ok(res.body.data.requisiteId.length >= 5);
  assert.strictEqual(res.body.data.type, 'UPI');
  assert.strictEqual(res.body.data.accountHolderName, 'Ganesh Kumar');
  assert.strictEqual(res.body.data.accountOrUpi, 'ganesh@upi');
  assert.strictEqual(res.body.data.status, 'INACTIVE');
  assert.strictEqual(res.body.data.approvalStatus, 'PENDING_REVIEW');
  assert.strictEqual(res.body.data.payinEnabled, false);
});

// 3. Create IMPS Requisite & validation
test('Requisites: Trader POST /api/trader/requisites creates IMPS requisite with confirmation match and IFSC validation', async () => {
  const { cookies } = await createAndLoginUser('trader_req_03', 'Pass12345!', 'TRADER');

  // Mismatched account numbers
  const mismatchRes = await request(app)
    .post('/api/trader/requisites')
    .set('Cookie', cookies)
    .send({
      type: 'IMPS',
      accountHolderName: 'Rajesh Sharma',
      bankName: 'HDFC Bank',
      accountNumber: '50100012345678',
      confirmAccountNumber: '50100099999999',
      ifsc: 'HDFC0001234',
      dailyLimit: 300000,
    });

  assert.strictEqual(mismatchRes.status, 400);
  assert.strictEqual(mismatchRes.body.success, false);

  // Valid IMPS creation
  const validRes = await request(app)
    .post('/api/trader/requisites')
    .set('Cookie', cookies)
    .send({
      type: 'IMPS',
      accountHolderName: 'Rajesh Sharma',
      bankName: 'HDFC Bank',
      accountNumber: '50100012345678',
      confirmAccountNumber: '50100012345678',
      ifsc: 'HDFC0001234',
      dailyLimit: 300000,
    });

  assert.strictEqual(validRes.status, 201);
  assert.strictEqual(validRes.body.success, true);
  assert.strictEqual(validRes.body.data.type, 'IMPS');
  assert.ok(validRes.body.data.accountOrUpi.includes('5678'));
  assert.strictEqual(validRes.body.data.ifsc, 'HDFC0001234');
});

// 4. PayIn Toggle Rules: Cannot turn ON while Inactive
test('Requisites: PayIn ON is strictly blocked when requisite is Inactive or Unapproved', async () => {
  const { cookies } = await createAndLoginUser('trader_req_04', 'Pass12345!', 'TRADER');

  const createRes = await request(app)
    .post('/api/trader/requisites')
    .set('Cookie', cookies)
    .send({
      type: 'UPI',
      accountHolderName: 'Amit Verma',
      upiId: 'amit@okhdfcbank',
      bankName: 'HDFC Bank',
      dailyLimit: 200000,
    });

  const reqId = createRes.body.data._id;

  // Try to toggle PayIn ON while INACTIVE
  const toggleRes = await request(app)
    .patch(`/api/trader/requisites/${reqId}/payin`)
    .set('Cookie', cookies)
    .send({ payinEnabled: true });

  assert.strictEqual(toggleRes.status, 400);
  assert.strictEqual(toggleRes.body.success, false);
  assert.ok(toggleRes.body.message.includes('inactive'));
});

// 5. Admin Approval & Trader PayIn Activation Flow
test('Requisites: Admin approves and activates requisite; Trader can then toggle PayIn ON', async () => {
  const trader = await createAndLoginUser('trader_approved', 'Pass12345!', 'TRADER');
  const admin = await createAndLoginUser('admin_verifier', 'AdminPass#2026', 'ADMIN');

  const createRes = await request(app)
    .post('/api/trader/requisites')
    .set('Cookie', trader.cookies)
    .send({
      type: 'UPI',
      accountHolderName: 'Sunil Singh',
      upiId: 'sunil@paytm',
      bankName: 'Paytm Payments Bank',
      dailyLimit: 500000,
    });

  const reqId = createRes.body.data._id;

  // Admin approves
  const approveRes = await request(app)
    .post(`/api/admin/requisites/${reqId}/approve`)
    .set('Cookie', admin.cookies)
    .send({ notes: 'Verified bank documents' });

  assert.strictEqual(approveRes.status, 200);
  assert.strictEqual(approveRes.body.success, true);
  assert.strictEqual(approveRes.body.data.status, 'ACTIVE');
  assert.strictEqual(approveRes.body.data.approvalStatus, 'APPROVED');

  // Trader now toggles PayIn ON
  const toggleOnRes = await request(app)
    .patch(`/api/trader/requisites/${reqId}/payin`)
    .set('Cookie', trader.cookies)
    .send({ payinEnabled: true });

  assert.strictEqual(toggleOnRes.status, 200);
  assert.strictEqual(toggleOnRes.body.success, true);
  assert.strictEqual(toggleOnRes.body.data.payinEnabled, true);

  // Summary now counts 1 active requisite
  const sumRes = await request(app)
    .get('/api/trader/requisites/summary')
    .set('Cookie', trader.cookies);

  assert.strictEqual(sumRes.body.data.active, 1);
  assert.strictEqual(sumRes.body.data.totalDailyLimit, 500000);
});

// 6. Admin Rejection Flow
test('Requisites: Admin rejection updates status to REJECTED with required reason', async () => {
  const trader = await createAndLoginUser('trader_rej', 'Pass12345!', 'TRADER');
  const admin = await createAndLoginUser('admin_verifier2', 'AdminPass#2026', 'ADMIN');

  const createRes = await request(app)
    .post('/api/trader/requisites')
    .set('Cookie', trader.cookies)
    .send({
      type: 'UPI',
      accountHolderName: 'Karan Patel',
      upiId: 'karan@sbi',
      bankName: 'SBI',
      dailyLimit: 100000,
    });

  const reqId = createRes.body.data._id;

  // Reject without reason fails
  const noReasonRes = await request(app)
    .post(`/api/admin/requisites/${reqId}/reject`)
    .set('Cookie', admin.cookies)
    .send({});

  assert.strictEqual(noReasonRes.status, 400);

  // Reject with reason succeeds
  const rejectRes = await request(app)
    .post(`/api/admin/requisites/${reqId}/reject`)
    .set('Cookie', admin.cookies)
    .send({ reason: 'Name mismatch on bank records' });

  assert.strictEqual(rejectRes.status, 200);
  assert.strictEqual(rejectRes.body.success, true);
  assert.strictEqual(rejectRes.body.data.status, 'REJECTED');
  assert.strictEqual(rejectRes.body.data.approvalStatus, 'REJECTED');
  assert.strictEqual(rejectRes.body.data.rejectionReason, 'Name mismatch on bank records');
});

// 7. Data Isolation & IDOR Protection
test('Requisites: IDOR Protection prevents another trader from viewing or toggling PayIn', async () => {
  const trader1 = await createAndLoginUser('trader_first', 'Pass12345!', 'TRADER');
  const trader2 = await createAndLoginUser('trader_second', 'Pass12345!', 'TRADER');

  const createRes = await request(app)
    .post('/api/trader/requisites')
    .set('Cookie', trader1.cookies)
    .send({
      type: 'UPI',
      accountHolderName: 'Private Trader',
      upiId: 'private@upi',
      bankName: 'ICICI Bank',
      dailyLimit: 400000,
    });

  const reqId = createRes.body.data._id;

  // Trader 2 attempts to view Trader 1 requisite
  const viewRes = await request(app)
    .get(`/api/trader/requisites/${reqId}`)
    .set('Cookie', trader2.cookies);

  assert.strictEqual(viewRes.status, 404);

  // Trader 2 attempts to toggle PayIn for Trader 1 requisite
  const toggleRes = await request(app)
    .patch(`/api/trader/requisites/${reqId}/payin`)
    .set('Cookie', trader2.cookies)
    .send({ payinEnabled: true });

  assert.strictEqual(toggleRes.status, 404);
});
