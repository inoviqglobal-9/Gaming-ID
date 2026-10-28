const test = require('node:test');
const assert = require('node:assert');
const { exec } = require('child_process');
const path = require('path');
const User = require('../models/User');
const { setupTestDB, cleanupTestDB, clearCollections } = require('./setup');

let mongoUri;

test.before(async () => {
  mongoUri = await setupTestDB();
});

test.after(async () => {
  await cleanupTestDB();
});

test.beforeEach(async () => {
  await clearCollections();
});

test('Bootstrap: Creates initial admin and running second time preserves existing admin without overwrite', async () => {
  const scriptPath = path.resolve(__dirname, '../scripts/bootstrapAdmin.js');

  const runBootstrap = (env) => {
    return new Promise((resolve) => {
      exec(`node "${scriptPath}"`, { env: { ...process.env, ...env } }, (err, stdout, stderr) => {
        resolve({ code: err ? err.code : 0, stdout, stderr });
      });
    });
  };

  // 1. Run with missing password -> should fail
  const failRes = await runBootstrap({
    MONGODB_URI: mongoUri,
    ADMIN_USERNAME: 'initial_admin',
    ADMIN_PASSWORD: '',
  });
  assert.notStrictEqual(failRes.code, 0);

  // 2. Run with valid credentials -> creates admin
  const successRes = await runBootstrap({
    MONGODB_URI: mongoUri,
    ADMIN_USERNAME: 'initial_admin',
    ADMIN_PASSWORD: 'SuperSecurePassword2026!',
  });
  assert.strictEqual(successRes.code, 0);
  assert.ok(successRes.stdout.includes('Initial Administrator created successfully'));

  const createdAdmin = await User.findOne({ username: 'initial_admin' });
  assert.ok(createdAdmin);
  assert.strictEqual(createdAdmin.role, 'ADMIN');
  assert.strictEqual(createdAdmin.status, 'ACTIVE');
  const originalHash = createdAdmin.passwordHash;

  // 3. Run bootstrap second time with different password -> must preserve original and NOT overwrite!
  const secondRun = await runBootstrap({
    MONGODB_URI: mongoUri,
    ADMIN_USERNAME: 'different_admin',
    ADMIN_PASSWORD: 'AnotherStrongPassword999!',
  });
  assert.strictEqual(secondRun.code, 0);
  assert.ok(secondRun.stdout.includes('An Administrator account already exists'));
  assert.ok(secondRun.stdout.includes('Existing Admin account was preserved'));

  const checkAdminAfter = await User.findOne({ username: 'initial_admin' });
  assert.strictEqual(checkAdminAfter.passwordHash, originalHash);
});
