const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const Session = require('../models/Session');
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

test('Client Auth Flow: Complete Admin creation -> Client Login -> Dashboard Session -> Logout', async () => {
  // 1. Setup Admin account
  const adminPassword = 'AdminSecurePass!99';
  const adminHash = await User.hashPassword(adminPassword);
  await User.create({
    username: 'admin_officer',
    passwordHash: adminHash,
    role: 'ADMIN',
    status: 'ACTIVE',
  });

  // Admin logs in
  const adminLoginRes = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin_officer', password: adminPassword });
  assert.strictEqual(adminLoginRes.status, 200);
  const adminCookie = adminLoginRes.headers['set-cookie'][0];
  assert.ok(adminCookie);

  // Test I: Password validation - password under 6 chars rejected
  const shortPassRes = await request(app)
    .post('/api/admin/clients')
    .set('Cookie', adminCookie)
    .send({
      username: 'client_invalid',
      password: '123',
    });
  assert.strictEqual(shortPassRes.status, 400);
  assert.ok(shortPassRes.body.message.includes('at least 6 characters'));

  // Test A: Admin creates client with specific assigned permanent password
  const assignedPassword = 'TraderClient#2026';
  const createClientRes = await request(app)
    .post('/api/admin/clients')
    .set('Cookie', adminCookie)
    .send({
      username: 'trader_vip_99',
      password: assignedPassword,
      notes: 'VIP Client assigned with permanent password',
    });

  assert.strictEqual(createClientRes.status, 201);
  assert.strictEqual(createClientRes.body.success, true);
  assert.strictEqual(createClientRes.body.client.username, 'trader_vip_99');
  assert.strictEqual(createClientRes.body.client.mustChangePassword, false);
  assert.strictEqual(createClientRes.body.password, assignedPassword);

  // Verify client saved in MongoDB
  const savedInDb = await User.findOne({ username: 'trader_vip_99' });
  assert.ok(savedInDb);
  assert.strictEqual(savedInDb.role, 'CLIENT');
  assert.strictEqual(savedInDb.status, 'ACTIVE');
  assert.strictEqual(savedInDb.mustChangePassword, false);

  // Test E: Invalid password rejected
  const badLoginRes = await request(app)
    .post('/api/auth/login')
    .send({ username: 'trader_vip_99', password: 'WrongPassword123' });
  assert.strictEqual(badLoginRes.status, 401);
  assert.strictEqual(badLoginRes.body.success, false);
  assert.strictEqual(badLoginRes.body.message, 'Invalid credentials. Please verify your username and password.');

  // Test B: Client logs in directly with assigned permanent credentials
  const clientLoginRes = await request(app)
    .post('/api/auth/login')
    .send({ username: 'trader_vip_99', password: assignedPassword });

  assert.strictEqual(clientLoginRes.status, 200);
  assert.strictEqual(clientLoginRes.body.success, true);
  assert.strictEqual(clientLoginRes.body.user.username, 'trader_vip_99');
  assert.strictEqual(clientLoginRes.body.user.role, 'CLIENT');

  const clientCookie = clientLoginRes.headers['set-cookie'][0];
  assert.ok(clientCookie);
  assert.ok(clientCookie.includes('Path=/'));

  // Test C & D: Direct Dashboard access and session restoration on refresh
  const meRes = await request(app)
    .get('/api/auth/me')
    .set('Cookie', clientCookie);

  assert.strictEqual(meRes.status, 200);
  assert.strictEqual(meRes.body.success, true);
  assert.strictEqual(meRes.body.user.username, 'trader_vip_99');
  assert.strictEqual(meRes.body.user.role, 'CLIENT');
  assert.ok(meRes.body.balances);
  assert.strictEqual(typeof meRes.body.balances.INR, 'number');
  assert.strictEqual(typeof meRes.body.balances.USDT, 'number');

  // Test H: Direct financial access - client can perform PayIn requests directly without forced password change!
  const directPayInRes = await request(app)
    .post('/api/payin')
    .set('Cookie', clientCookie)
    .send({ amount: 1000, currency: 'INR' });
  assert.strictEqual(directPayInRes.status, 201);
  assert.strictEqual(directPayInRes.body.success, true);

  // Test I: Client role blocked from admin functionality
  const forbiddenRes = await request(app)
    .get('/api/admin/clients')
    .set('Cookie', clientCookie);
  assert.strictEqual(forbiddenRes.status, 403);
  assert.strictEqual(forbiddenRes.body.success, false);

  // Test J: Client can optionally change password from Profile if desired
  const newPermanentPassword = 'BrandNewStrongPassword#2026';
  const changePassRes = await request(app)
    .post('/api/auth/change-password')
    .set('Cookie', clientCookie)
    .send({ currentPassword: assignedPassword, newPassword: newPermanentPassword });
  assert.strictEqual(changePassRes.status, 200);
  assert.strictEqual(changePassRes.body.success, true);

  // Test K: Admin attempts to delete client with financial history (must be rejected)
  const rejectDeleteRes = await request(app)
    .delete(`/api/admin/clients/${savedInDb._id}`)
    .set('Cookie', adminCookie);
  assert.strictEqual(rejectDeleteRes.status, 400);
  assert.ok(rejectDeleteRes.body.message.includes('financial transaction history exists'));

  // Test L: Admin creates clean test client and deletes it successfully
  const tempClientRes = await request(app)
    .post('/api/admin/clients')
    .set('Cookie', adminCookie)
    .send({ username: 'temp_to_delete', password: 'TempPass123!' });
  assert.strictEqual(tempClientRes.status, 201);
  const tempClientId = tempClientRes.body.client.id;

  const successfulDeleteRes = await request(app)
    .delete(`/api/admin/clients/${tempClientId}`)
    .set('Cookie', adminCookie);
  assert.strictEqual(successfulDeleteRes.status, 200);
  assert.strictEqual(successfulDeleteRes.body.success, true);

  // Test G: Logout invalidates session
  const logoutRes = await request(app)
    .post('/api/auth/logout')
    .set('Cookie', clientCookie);
  assert.strictEqual(logoutRes.status, 200);
  assert.strictEqual(logoutRes.body.success, true);

  // Verify old session no longer works
  const postLogoutMe = await request(app)
    .get('/api/auth/me')
    .set('Cookie', clientCookie);
  assert.strictEqual(postLogoutMe.status, 401);
});
