const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const { setupTestDB, cleanupTestDB, clearCollections } = require('./setup');

let adminCookie;
let clientCookie;

test.before(async () => {
  await setupTestDB();
});

test.after(async () => {
  await cleanupTestDB();
});

test.beforeEach(async () => {
  await clearCollections();

  // Create admin
  const adminHash = await User.hashPassword('AdminPass#123456');
  await User.create({ username: 'superadmin', passwordHash: adminHash, role: 'ADMIN', status: 'ACTIVE' });

  // Create client
  const clientHash = await User.hashPassword('ClientPass#123456');
  await User.create({ username: 'trader101', passwordHash: clientHash, role: 'CLIENT', status: 'ACTIVE' });

  // Login admin
  const adminLogin = await request(app).post('/api/auth/login').send({ username: 'superadmin', password: 'AdminPass#123456' });
  adminCookie = adminLogin.headers['set-cookie'][0];

  // Login client
  const clientLogin = await request(app).post('/api/auth/login').send({ username: 'trader101', password: 'ClientPass#123456' });
  clientCookie = clientLogin.headers['set-cookie'][0];
});

test('Admin: Client role cannot access Admin APIs (403 Forbidden)', async () => {
  const res = await request(app)
    .get('/api/admin/clients')
    .set('Cookie', clientCookie);

  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.success, false);
});

test('Admin: Admin can create client account and duplicate username is rejected', async () => {
  // Create new client
  const res = await request(app)
    .post('/api/admin/clients')
    .set('Cookie', adminCookie)
    .send({
      username: 'alice_trader',
      notes: 'Test client account',
    });

  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.client.username, 'alice_trader');
  assert.strictEqual(res.body.client.role, 'CLIENT');
  assert.ok(res.body.temporaryPassword);

  // Attempt duplicate creation
  const dupRes = await request(app)
    .post('/api/admin/clients')
    .set('Cookie', adminCookie)
    .send({ username: 'alice_trader' });

  assert.strictEqual(dupRes.status, 409);
  assert.strictEqual(dupRes.body.success, false);
});

test('Admin: Bulk generate users creates accounts up to configured max limit', async () => {
  const res = await request(app)
    .post('/api/admin/generate-users')
    .set('Cookie', adminCookie)
    .send({ count: 5, prefix: 'BATCH' });

  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.accounts.length, 5);
  for (const acc of res.body.accounts) {
    assert.ok(acc.username.startsWith('batch_'));
    assert.ok(acc.temporaryPassword);
  }

  // Reject excessive batch
  const excessRes = await request(app)
    .post('/api/admin/generate-users')
    .set('Cookie', adminCookie)
    .send({ count: 1000 });

  assert.strictEqual(excessRes.status, 400);
});

test('Admin: CSV export does not expose password hashes', async () => {
  const res = await request(app)
    .get('/api/admin/clients/export-csv')
    .set('Cookie', adminCookie);

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers['content-type'], 'text/csv; charset=utf-8');
  assert.ok(!res.text.includes('$2a$'));
  assert.ok(!res.text.includes('$2b$'));
  assert.ok(res.text.includes('Client ID'));
});
