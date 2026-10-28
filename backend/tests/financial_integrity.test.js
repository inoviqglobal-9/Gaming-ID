const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const BalanceLedger = require('../models/BalanceLedger');
const { setupTestDB, cleanupTestDB, clearCollections } = require('./setup');

let adminCookie;
let clientCookie;
let clientUser;

test.before(async () => {
  await setupTestDB();
});

test.after(async () => {
  await cleanupTestDB();
});

test.beforeEach(async () => {
  await clearCollections();

  const adminHash = await User.hashPassword('AdminMaster#2026');
  await User.create({ username: 'system_admin', passwordHash: adminHash, role: 'ADMIN', status: 'ACTIVE' });

  const clientHash = await User.hashPassword('TraderClient#2026');
  clientUser = await User.create({ username: 'trader_karan', passwordHash: clientHash, role: 'CLIENT', status: 'ACTIVE' });

  const adminLogin = await request(app).post('/api/auth/login').send({ username: 'system_admin', password: 'AdminMaster#2026' });
  adminCookie = adminLogin.headers['set-cookie'][0];

  const clientLogin = await request(app).post('/api/auth/login').send({ username: 'trader_karan', password: 'TraderClient#2026' });
  clientCookie = clientLogin.headers['set-cookie'][0];
});

test('Financial: Unverified PayIn does NOT increase client balance', async () => {
  // Ensure a LIVE scanner is active
  const ScannerConfig = require('../models/ScannerConfig');
  await ScannerConfig.create({
    scannerId: 'QR-TEST-LIVE',
    scannerName: 'Live Test Scanner',
    merchantName: 'Live Test Merchant',
    mode: 'LIVE',
    status: 'ACTIVE',
    isActive: true,
    isPublished: true,
  });

  // 1. Create PayIn
  const payInRes = await request(app)
    .post('/api/payin')
    .set('Cookie', clientCookie)
    .send({ amount: 5000, currency: 'INR' });

  assert.strictEqual(payInRes.status, 201);
  const payInId = payInRes.body.payIn.id;

  // Check balance before confirmation: must be 0
  const balRes1 = await request(app).get('/api/auth/me').set('Cookie', clientCookie);
  assert.strictEqual(balRes1.body.balances.INR, 0);

  // 2. Submit reference
  await request(app)
    .post(`/api/payin/${payInId}/submit-reference`)
    .set('Cookie', clientCookie)
    .send({ referenceId: 'UTR9876543210' });

  // Balance still 0 (unverified payments never affect balance)
  const balRes2 = await request(app).get('/api/auth/me').set('Cookie', clientCookie);
  assert.strictEqual(balRes2.body.balances.INR, 0);

  // 3. Admin independently confirms
  const verifyRes = await request(app)
    .patch(`/api/payin/admin/${payInId}/review`)
    .set('Cookie', adminCookie)
    .send({ action: 'CONFIRM', decisionNotes: 'Verified with bank statement' });

  assert.strictEqual(verifyRes.status, 200);

  // Balance is now credited to 5000
  const balRes3 = await request(app).get('/api/auth/me').set('Cookie', clientCookie);
  assert.strictEqual(balRes3.body.balances.INR, 5000);

  // 4. Attempting to confirm the same PayIn twice must be rejected
  const duplicateConfirmRes = await request(app)
    .patch(`/api/payin/admin/${payInId}/review`)
    .set('Cookie', adminCookie)
    .send({ action: 'CONFIRM' });

  assert.strictEqual(duplicateConfirmRes.status, 400);
});

test('Financial: Payout cannot exceed verified available balance', async () => {
  // Balance is 0, attempting 1000 payout must be rejected
  const payoutRes = await request(app)
    .post('/api/payout')
    .set('Cookie', clientCookie)
    .send({
      amount: 1000,
      currency: 'INR',
      accountHolder: 'Karan Sharma',
      accountNumber: '123456789012',
    });

  assert.strictEqual(payoutRes.status, 400);
  assert.ok(payoutRes.body.message.includes('Insufficient verified balance'));
});
