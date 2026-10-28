const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const DepositRequest = require('../models/DepositRequest');
const DepositConfig = require('../models/DepositConfig');
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

// 1. Trader Settings
test('Deposits: Trader GET /api/trader/deposit-settings returns configuration and wallet', async () => {
  const { cookies } = await createAndLoginUser('trader_dep_01', 'Pass12345!', 'TRADER');

  const res = await request(app)
    .get('/api/trader/deposit-settings')
    .set('Cookie', cookies);

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.workingDepositEnabled, true);
  assert.strictEqual(res.body.data.securityDepositEnabled, true);
  assert.ok(res.body.data.minDepositAmountUsdt > 0);
  assert.ok(res.body.data.destinationWallets.length > 0);
});

// 2. Create Deposit Request
test('Deposits: Trader POST /api/trader/deposit-requests creates draft deposit with timer and wallet snapshot', async () => {
  const { cookies } = await createAndLoginUser('trader_dep_02', 'Pass12345!', 'TRADER');

  const res = await request(app)
    .post('/api/trader/deposit-requests')
    .set('Cookie', cookies)
    .send({
      depositType: 'SECURITY_DEPOSIT',
      amount: 1000,
      currency: 'USDT',
    });

  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.success, true);
  assert.ok(res.body.data.requestId.startsWith('TDR-'));
  assert.strictEqual(res.body.data.depositType, 'SECURITY_DEPOSIT');
  assert.strictEqual(res.body.data.amount, 1000);
  assert.strictEqual(res.body.data.status, 'DRAFT');
  assert.strictEqual(res.body.data.verification, 'NOT_CHECKED');
  assert.ok(res.body.data.wallet.length > 10);
  assert.ok(res.body.data.expiresAt !== null);
});

// 3. Prevent duplicate active draft creation
test('Deposits: Trader creating deposit while active draft exists returns existing draft', async () => {
  const { cookies } = await createAndLoginUser('trader_dep_03', 'Pass12345!', 'TRADER');

  // Create first
  const res1 = await request(app)
    .post('/api/trader/deposit-requests')
    .set('Cookie', cookies)
    .send({
      depositType: 'WORKING_DEPOSIT',
      amount: 500,
      currency: 'USDT',
    });

  assert.strictEqual(res1.status, 201);
  const originalRequestId = res1.body.data.requestId;

  // Try creating second while active
  const res2 = await request(app)
    .post('/api/trader/deposit-requests')
    .set('Cookie', cookies)
    .send({
      depositType: 'SECURITY_DEPOSIT',
      amount: 1000,
      currency: 'USDT',
    });

  assert.strictEqual(res2.status, 200);
  assert.strictEqual(res2.body.isExistingActive, true);
  assert.strictEqual(res2.body.data.requestId, originalRequestId);
});

// 4. Validate TRON TX Hash (must be 64 hex characters)
test('Deposits: Evidence submission rejects invalid TX hash and accepts 64-hex hash', async () => {
  const { cookies } = await createAndLoginUser('trader_dep_04', 'Pass12345!', 'TRADER');

  // Create draft
  const createRes = await request(app)
    .post('/api/trader/deposit-requests')
    .set('Cookie', cookies)
    .send({
      depositType: 'SECURITY_DEPOSIT',
      amount: 1000,
      currency: 'USDT',
    });

  const depositId = createRes.body.data._id;

  // Submit short invalid hash
  const invalidRes = await request(app)
    .post(`/api/trader/deposit-requests/${depositId}/submit-evidence`)
    .set('Cookie', cookies)
    .send({
      txHash: 'tooshort12345',
    });

  assert.strictEqual(invalidRes.status, 400);
  assert.strictEqual(invalidRes.body.success, false);

  // Submit valid 64-hex hash
  const validHash = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
  const validRes = await request(app)
    .post(`/api/trader/deposit-requests/${depositId}/submit-evidence`)
    .set('Cookie', cookies)
    .send({
      txHash: validHash,
    });

  assert.strictEqual(validRes.status, 200);
  assert.strictEqual(validRes.body.success, true);
  assert.strictEqual(validRes.body.data.status, 'SUBMITTED');
  assert.strictEqual(validRes.body.data.verification, 'CHECKING');
  assert.strictEqual(validRes.body.data.txHash, validHash);
  assert.ok(validRes.body.data.submittedAt !== null);
});

// 5. Data Isolation & IDOR Protection
test('Deposits: IDOR Protection prevents another trader from submitting evidence', async () => {
  const trader1 = await createAndLoginUser('trader_owner', 'Pass12345!', 'TRADER');
  const trader2 = await createAndLoginUser('trader_attacker', 'Pass12345!', 'TRADER');

  // Trader 1 creates
  const createRes = await request(app)
    .post('/api/trader/deposit-requests')
    .set('Cookie', trader1.cookies)
    .send({
      depositType: 'WORKING_DEPOSIT',
      amount: 2000,
      currency: 'USDT',
    });

  const depositId = createRes.body.data._id;

  // Trader 2 attempts to view Trader 1 deposit
  const viewRes = await request(app)
    .get(`/api/trader/deposit-requests/${depositId}`)
    .set('Cookie', trader2.cookies);

  assert.strictEqual(viewRes.status, 404);

  // Trader 2 attempts to submit evidence on Trader 1 deposit
  const submitRes = await request(app)
    .post(`/api/trader/deposit-requests/${depositId}/submit-evidence`)
    .set('Cookie', trader2.cookies)
    .send({
      txHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    });

  assert.strictEqual(submitRes.status, 404);
});

// 6. Admin Approval with Verified Ledger Balance Credit
test('Deposits: Admin approval credits verified funds to BalanceLedger idempotently', async () => {
  const trader = await createAndLoginUser('trader_funded', 'Pass12345!', 'TRADER');
  const admin = await createAndLoginUser('admin_auditor', 'AdminPass#2026', 'ADMIN');

  // Trader creates and submits evidence
  const createRes = await request(app)
    .post('/api/trader/deposit-requests')
    .set('Cookie', trader.cookies)
    .send({
      depositType: 'SECURITY_DEPOSIT',
      amount: 1000,
      currency: 'USDT',
    });

  const depositId = createRes.body.data._id;
  const requestId = createRes.body.data.requestId;
  const txHash = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

  await request(app)
    .post(`/api/trader/deposit-requests/${depositId}/submit-evidence`)
    .set('Cookie', trader.cookies)
    .send({ txHash });

  // Admin reviews and approves
  const approveRes = await request(app)
    .post(`/api/admin/deposit-requests/${depositId}/approve`)
    .set('Cookie', admin.cookies)
    .send({
      decisionNotes: 'Tronscan verified block 8847291',
    });

  assert.strictEqual(approveRes.status, 200);
  assert.strictEqual(approveRes.body.success, true);
  assert.strictEqual(approveRes.body.data.status, 'APPROVED');
  assert.strictEqual(approveRes.body.data.verification, 'VERIFIED');

  // Verify atomic ledger entry was recorded
  const ledgerEntries = await BalanceLedger.find({ referenceRequestId: requestId });
  assert.strictEqual(ledgerEntries.length, 1);
  assert.strictEqual(ledgerEntries[0].amount, 1000);
  assert.strictEqual(ledgerEntries[0].entryType, 'DEPOSIT_CONFIRMED');

  // Re-approving cannot credit twice (idempotency)
  const doubleApproveRes = await request(app)
    .post(`/api/admin/deposit-requests/${depositId}/approve`)
    .set('Cookie', admin.cookies)
    .send({ decisionNotes: 'Double approval attempt' });

  assert.strictEqual(doubleApproveRes.status, 400);
  const ledgerEntriesAfter = await BalanceLedger.find({ referenceRequestId: requestId });
  assert.strictEqual(ledgerEntriesAfter.length, 1);
});

// 7. Admin Rejection with Reason
test('Deposits: Admin rejection updates status to REJECTED and verification to FAILED', async () => {
  const trader = await createAndLoginUser('trader_rejected', 'Pass12345!', 'TRADER');
  const admin = await createAndLoginUser('admin_auditor2', 'AdminPass#2026', 'ADMIN');

  const createRes = await request(app)
    .post('/api/trader/deposit-requests')
    .set('Cookie', trader.cookies)
    .send({
      depositType: 'WORKING_DEPOSIT',
      amount: 500,
      currency: 'USDT',
    });

  const depositId = createRes.body.data._id;
  const txHash = 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';

  await request(app)
    .post(`/api/trader/deposit-requests/${depositId}/submit-evidence`)
    .set('Cookie', trader.cookies)
    .send({ txHash });

  // Admin rejects
  const rejectRes = await request(app)
    .post(`/api/admin/deposit-requests/${depositId}/reject`)
    .set('Cookie', admin.cookies)
    .send({
      reason: 'Transaction not found on TRON blockchain',
    });

  assert.strictEqual(rejectRes.status, 200);
  assert.strictEqual(rejectRes.body.success, true);
  assert.strictEqual(rejectRes.body.data.status, 'REJECTED');
  assert.strictEqual(rejectRes.body.data.verification, 'FAILED');
  assert.strictEqual(rejectRes.body.data.rejectionReason, 'Transaction not found on TRON blockchain');
});

// 8. Expired requests cannot submit evidence
test('Deposits: Expired deposit request cannot accept evidence submission', async () => {
  const { cookies, user } = await createAndLoginUser('trader_expired', 'Pass12345!', 'TRADER');

  // Manually create an already expired request
  const expiredReq = await DepositRequest.create({
    requestId: 'TDR-EXPIRED-9999',
    userId: user._id,
    clientId: user.username,
    depositType: 'WORKING_DEPOSIT',
    amount: 1000,
    currency: 'USDT',
    wallet: 'TX7D7vH3qV8kYq4eR9P4dE8vL3kYq4eR9P',
    status: 'EXPIRED',
    expiresAt: new Date(Date.now() - 3600000), // 1 hour ago
  });

  const submitRes = await request(app)
    .post(`/api/trader/deposit-requests/${expiredReq._id}/submit-evidence`)
    .set('Cookie', cookies)
    .send({
      txHash: 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    });

  assert.strictEqual(submitRes.status, 400);
  assert.strictEqual(submitRes.body.success, false);
  assert.ok(submitRes.body.message.includes('expired'));
});
