const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
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

test('Auth: 401 when visiting protected route without valid session', async () => {
  const res = await request(app).get('/api/auth/me');
  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.body.success, false);
});

test('Auth: Login rejects unknown username with generic error', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: 'nonexistent_user', password: 'AnyPassword123' });

  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.message, 'Invalid credentials. Please verify your username and password.');
});

test('Auth: Successful login sets HTTP-only cookie and returns user profile', async () => {
  const passwordHash = await User.hashPassword('StrongAdminSecret#2026');
  await User.create({
    username: 'master_admin',
    passwordHash,
    role: 'ADMIN',
    status: 'ACTIVE',
  });

  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: 'master_admin', password: 'StrongAdminSecret#2026' });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.user.username, 'master_admin');
  assert.strictEqual(res.body.user.role, 'ADMIN');

  // Verify cookie is set
  const cookies = res.headers['set-cookie'];
  assert.ok(cookies);
  assert.ok(cookies[0].includes('scanner_trader_session='));
  assert.ok(cookies[0].toLowerCase().includes('httponly'));

  // Test /api/auth/me with the session cookie
  const meRes = await request(app)
    .get('/api/auth/me')
    .set('Cookie', cookies[0]);

  assert.strictEqual(meRes.status, 200);
  assert.strictEqual(meRes.body.user.username, 'master_admin');
});

test('Auth: Suspended accounts lose protected access immediately', async () => {
  const passwordHash = await User.hashPassword('TraderClientPass123');
  const user = await User.create({
    username: 'trader_bob',
    passwordHash,
    role: 'CLIENT',
    status: 'ACTIVE',
  });

  // Login successfully
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ username: 'trader_bob', password: 'TraderClientPass123' });

  const sessionCookie = loginRes.headers['set-cookie'][0];

  // Verify can access me
  const check1 = await request(app).get('/api/auth/me').set('Cookie', sessionCookie);
  assert.strictEqual(check1.status, 200);

  // Admin suspends user
  user.status = 'SUSPENDED';
  await user.save();

  // Subsequent request using existing session must be rejected with 403
  const check2 = await request(app).get('/api/auth/me').set('Cookie', sessionCookie);
  assert.strictEqual(check2.status, 403);
  assert.ok(check2.body.message.includes('suspended'));
});
