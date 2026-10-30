const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../app');
const { setupTestDB, cleanupTestDB, clearCollections } = require('./setup');
const User = require('../models/User');
const ScannerConfig = require('../models/ScannerConfig');
const DepositRequest = require('../models/DepositRequest');
const DepositConfig = require('../models/DepositConfig');
const UsdtWallet = require('../models/UsdtWallet');
const BalanceLedger = require('../models/BalanceLedger');
const CryptoDepositRequest = require('../models/CryptoDepositRequest');

let adminCookie;
let traderCookie;
let adminUser;
let traderUser;
let activeScanner;

test.before(async () => {
  await setupTestDB();
});

test.after(async () => {
  await cleanupTestDB();
});

test.beforeEach(async () => {
  await clearCollections();

  const timestamp = Date.now();
  const passHash = await User.hashPassword('Pass@123456');

  adminUser = await User.create({
    username: `admin_timer_${timestamp}`,
    clientId: `admin_timer_${timestamp}`,
    passwordHash: passHash,
    role: 'ADMIN',
    status: 'ACTIVE',
  });

  traderUser = await User.create({
    username: `trader_timer_${timestamp}`,
    clientId: `trader_timer_${timestamp}`,
    passwordHash: passHash,
    role: 'TRADER',
    status: 'ACTIVE',
  });

  const aRes = await request(app)
    .post('/api/auth/login')
    .send({ username: adminUser.username, password: 'Pass@123456' });
  adminCookie = aRes.headers['set-cookie'] ? aRes.headers['set-cookie'][0] : '';

  const tRes = await request(app)
    .post('/api/auth/login')
    .send({ username: traderUser.username, password: 'Pass@123456' });
  traderCookie = tRes.headers['set-cookie'] ? tRes.headers['set-cookie'][0] : '';

  await DepositConfig.getOrCreateDefault();

  // Create and activate published TRC20 scanner for USDT deposits
  activeScanner = await ScannerConfig.create({
    scannerId: 'QR-TEST-30MIN',
    scannerName: 'Primary USDT TRC20 Vault',
    merchantName: 'Primary USDT TRC20 Vault',
    merchantIdentifier: 'TPF1ZetizM3m9nnu7xkh2EczsL2fZ6b8Nd',
    walletAddress: 'TPF1ZetizM3m9nnu7xkh2EczsL2fZ6b8Nd',
    qrImageUrl: '/uploads/scanner-30min-test.jpeg',
    network: 'TRC20',
    currency: 'USDT',
    status: 'ACTIVE',
    isActive: true,
    isPublished: true,
  });
});

test('Deposit Timer: 1. New Working Deposit sets expiresAt to exactly createdAt + 30 minutes (1,800,000 ms)', async () => {
  const beforeTime = Date.now();
  const res = await request(app)
    .post('/api/trader/deposit-requests')
    .set('Cookie', traderCookie)
    .send({
      depositType: 'WORKING_DEPOSIT',
      amount: 500,
      currency: 'USDT',
    });

  const afterTime = Date.now();

  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.depositType, 'WORKING_DEPOSIT');

  const createdDeposit = await DepositRequest.findById(res.body.data._id);
  assert.ok(createdDeposit.createdAt);
  assert.ok(createdDeposit.expiresAt);

  const durationMs = createdDeposit.expiresAt.getTime() - createdDeposit.createdAt.getTime();
  const expectedMs = 30 * 60 * 1000; // exactly 1,800,000 ms
  assert.strictEqual(durationMs, expectedMs, 'Payment duration must be exactly 30 minutes (1,800,000 ms)');

  // Initial remaining seconds formula: Math.ceil((expiresAt - now) / 1000)
  const remainingSec = Math.ceil((createdDeposit.expiresAt.getTime() - afterTime) / 1000);
  assert.ok(remainingSec >= 1798 && remainingSec <= 1800, `Initial remaining seconds should be ~1800 (30:00), got ${remainingSec}`);
});

test('Deposit Timer: 2. New Security Deposit sets expiresAt to exactly createdAt + 30 minutes (1,800,000 ms)', async () => {
  const res = await request(app)
    .post('/api/trader/deposit-requests')
    .set('Cookie', traderCookie)
    .send({
      depositType: 'SECURITY_DEPOSIT',
      amount: 1000,
      currency: 'USDT',
    });

  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.depositType, 'SECURITY_DEPOSIT');

  const createdDeposit = await DepositRequest.findById(res.body.data._id);
  const durationMs = createdDeposit.expiresAt.getTime() - createdDeposit.createdAt.getTime();
  assert.strictEqual(durationMs, 30 * 60 * 1000, 'Security deposit duration must be exactly 30 minutes');
});

test('Deposit Timer: 3. Countdown calculation and MM:SS formatting logic', async () => {
  const formatTimer = (seconds) => {
    if (seconds <= 0) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Conceptual formula: Math.max(0, Math.ceil((expiresAt - now) / 1000))
  const now = 1700000000000;
  const expiresAt = now + 30 * 60 * 1000; // 30 minutes

  // At creation (t = 0)
  const rem0 = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  assert.strictEqual(rem0, 1800);
  assert.strictEqual(formatTimer(rem0), '30:00');

  // After 1 second (t = 1s)
  const rem1 = Math.max(0, Math.ceil((expiresAt - (now + 1000)) / 1000));
  assert.strictEqual(rem1, 1799);
  assert.strictEqual(formatTimer(rem1), '29:59');

  // After 5 minutes (t = 300s)
  const rem5m = Math.max(0, Math.ceil((expiresAt - (now + 300000)) / 1000));
  assert.strictEqual(rem5m, 1500);
  assert.strictEqual(formatTimer(rem5m), '25:00');

  // After 29 minutes (t = 29m)
  const rem29m = Math.max(0, Math.ceil((expiresAt - (now + 29 * 60 * 1000)) / 1000));
  assert.strictEqual(rem29m, 60);
  assert.strictEqual(formatTimer(rem29m), '01:00');

  // After 29 mins 59s
  const rem29m59s = Math.max(0, Math.ceil((expiresAt - (now + 29 * 60 * 1000 + 59000)) / 1000));
  assert.strictEqual(rem29m59s, 1);
  assert.strictEqual(formatTimer(rem29m59s), '00:01');

  // At 00:00 (t = 30m)
  const rem30m = Math.max(0, Math.ceil((expiresAt - (now + 30 * 60 * 1000)) / 1000));
  assert.strictEqual(rem30m, 0);
  assert.strictEqual(formatTimer(rem30m), '00:00');
});

test('Deposit Timer: 4. Reopening existing draft does NOT reset or extend timer', async () => {
  // Create first draft
  const res1 = await request(app)
    .post('/api/trader/deposit-requests')
    .set('Cookie', traderCookie)
    .send({
      depositType: 'WORKING_DEPOSIT',
      amount: 400,
      currency: 'USDT',
    });

  assert.strictEqual(res1.status, 201);
  const originalExpiresAt = res1.body.data.expiresAt;
  const originalRequestId = res1.body.data.requestId;

  // Try to create second draft (simulating reopening or clicking Create Deposit again)
  const res2 = await request(app)
    .post('/api/trader/deposit-requests')
    .set('Cookie', traderCookie)
    .send({
      depositType: 'WORKING_DEPOSIT',
      amount: 600,
      currency: 'USDT',
    });

  assert.strictEqual(res2.status, 200);
  assert.strictEqual(res2.body.isExistingActive, true);
  assert.strictEqual(res2.body.data.requestId, originalRequestId);
  assert.strictEqual(
    new Date(res2.body.data.expiresAt).getTime(),
    new Date(originalExpiresAt).getTime(),
    'Existing draft expiresAt must NOT be modified or reset'
  );
});

test('Deposit Timer: 5. Unpaid draft automatically transitions to EXPIRED when timer reaches 00:00', async () => {
  // Create a draft with past expiresAt
  const pastExpiresAt = new Date(Date.now() - 5000); // 5 seconds ago
  const draft = await DepositRequest.create({
    requestId: 'TDR-EXPIRE-TEST',
    userId: traderUser._id,
    clientId: traderUser.username,
    depositType: 'WORKING_DEPOSIT',
    systemType: 'NORMAL',
    amount: 300,
    currency: 'USDT',
    network: 'TRC20',
    wallet: 'TPF1ZetizM3m9nnu7xkh2EczsL2fZ6b8Nd',
    status: 'DRAFT',
    verification: 'NOT_CHECKED',
    expiresAt: pastExpiresAt,
  });

  // Querying deposits triggers checkAndExpireRequests
  const listRes = await request(app)
    .get('/api/trader/deposit-requests')
    .set('Cookie', traderCookie);

  assert.strictEqual(listRes.status, 200);
  const found = listRes.body.data.find((d) => d.requestId === 'TDR-EXPIRE-TEST');
  assert.ok(found);
  assert.strictEqual(found.status, 'EXPIRED', 'Unpaid request past expiresAt must be marked EXPIRED');

  // Verify in MongoDB
  const dbDoc = await DepositRequest.findById(draft._id);
  assert.strictEqual(dbDoc.status, 'EXPIRED');
});

test('Deposit Timer: 6. Expired request cannot submit new payment evidence', async () => {
  const pastExpiresAt = new Date(Date.now() - 10000);
  const expiredDeposit = await DepositRequest.create({
    requestId: 'TDR-SUBMIT-REJECT',
    userId: traderUser._id,
    clientId: traderUser.username,
    depositType: 'WORKING_DEPOSIT',
    systemType: 'NORMAL',
    amount: 500,
    currency: 'USDT',
    network: 'TRC20',
    wallet: 'TPF1ZetizM3m9nnu7xkh2EczsL2fZ6b8Nd',
    status: 'EXPIRED',
    verification: 'NOT_CHECKED',
    expiresAt: pastExpiresAt,
  });

  const validTxHash = '1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff';
  const submitRes = await request(app)
    .post(`/api/trader/deposit-requests/${expiredDeposit._id}/submit-evidence`)
    .set('Cookie', traderCookie)
    .send({
      txHash: validTxHash,
    });

  assert.strictEqual(submitRes.status, 400);
  assert.strictEqual(submitRes.body.success, false);
  assert.ok(submitRes.body.message.toLowerCase().includes('expired'));
});

test('Deposit Timer: 7. Submitted payment waiting for Admin review does NOT expire after expiresAt passes', async () => {
  // Create submitted deposit whose original timer was in the past
  const pastExpiresAt = new Date(Date.now() - 60000); // 1 minute ago
  const validTxHash = 'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899';
  const submittedDeposit = await DepositRequest.create({
    requestId: 'TDR-SUBMITTED-PERSIST',
    userId: traderUser._id,
    clientId: traderUser.username,
    depositType: 'WORKING_DEPOSIT',
    systemType: 'NORMAL',
    amount: 750,
    currency: 'USDT',
    network: 'TRC20',
    wallet: 'TPF1ZetizM3m9nnu7xkh2EczsL2fZ6b8Nd',
    status: 'SUBMITTED',
    verification: 'CHECKING',
    txHash: validTxHash,
    submittedAt: new Date(Date.now() - 120000),
    expiresAt: pastExpiresAt,
  });

  // Query trader deposit requests (triggers checkAndExpireRequests)
  const listRes = await request(app)
    .get('/api/trader/deposit-requests')
    .set('Cookie', traderCookie);

  assert.strictEqual(listRes.status, 200);
  const found = listRes.body.data.find((d) => d.requestId === 'TDR-SUBMITTED-PERSIST');
  assert.ok(found);
  assert.strictEqual(found.status, 'SUBMITTED', 'Submitted request must NOT be transitioned to EXPIRED');

  // Verify in MongoDB
  const dbDoc = await DepositRequest.findById(submittedDeposit._id);
  assert.strictEqual(dbDoc.status, 'SUBMITTED');
  assert.strictEqual(dbDoc.verification, 'CHECKING');
});

test('Deposit Timer: 8. Approved payments are NOT expired when expiresAt is in the past', async () => {
  const approvedDeposit = await DepositRequest.create({
    requestId: 'TDR-APPROVED-PERSIST',
    userId: traderUser._id,
    clientId: traderUser.username,
    depositType: 'SECURITY_DEPOSIT',
    systemType: 'NORMAL',
    amount: 1000,
    currency: 'USDT',
    network: 'TRC20',
    wallet: 'TPF1ZetizM3m9nnu7xkh2EczsL2fZ6b8Nd',
    status: 'APPROVED',
    verification: 'VERIFIED',
    txHash: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    approvedAt: new Date(),
    expiresAt: new Date(Date.now() - 3600000), // 1 hour ago
  });

  const listRes = await request(app)
    .get('/api/trader/deposit-requests')
    .set('Cookie', traderCookie);

  assert.strictEqual(listRes.status, 200);
  const found = listRes.body.data.find((d) => d.requestId === 'TDR-APPROVED-PERSIST');
  assert.ok(found);
  assert.strictEqual(found.status, 'APPROVED', 'Approved request must remain APPROVED');
});

test('Deposit Timer: 9. Working Deposit vs Security Deposit accounting and Crypto Dashboard separation remain intact', async () => {
  // 1. Create and approve Working Deposit
  const workRes = await request(app)
    .post('/api/trader/deposit-requests')
    .set('Cookie', traderCookie)
    .send({
      depositType: 'WORKING_DEPOSIT',
      amount: 500,
      currency: 'USDT',
    });
  assert.strictEqual(workRes.status, 201);
  const workDepId = workRes.body.data._id;

  const validTx1 = '1212121212121212121212121212121212121212121212121212121212121212';
  await request(app)
    .post(`/api/trader/deposit-requests/${workDepId}/submit-evidence`)
    .set('Cookie', traderCookie)
    .send({ txHash: validTx1, screenshot: '/uploads/proof1.png' });

  // Admin approves Working Deposit
  const approveWork = await request(app)
    .patch(`/api/deposits/admin/${workDepId}/review`)
    .set('Cookie', adminCookie)
    .send({ action: 'APPROVE', decisionNotes: 'Approved working deposit' });
  assert.strictEqual(approveWork.status, 200);

  // Check trader wallet: Available USDT should be 500, Security Deposit should be 0
  let wallet = await UsdtWallet.syncWithLedger(traderUser._id);
  let normalVal = await wallet.toSubledgerValuation('NORMAL');
  assert.strictEqual(parseFloat(normalVal.availableBalance), 500);
  assert.strictEqual(parseFloat(normalVal.securityDepositBalance), 0);

  // 2. Create and approve Security Deposit
  const secRes = await request(app)
    .post('/api/trader/deposit-requests')
    .set('Cookie', traderCookie)
    .send({
      depositType: 'SECURITY_DEPOSIT',
      amount: 1000,
      currency: 'USDT',
    });
  assert.strictEqual(secRes.status, 201);
  const secDepId = secRes.body.data._id;

  const validTx2 = '3434343434343434343434343434343434343434343434343434343434343434';
  await request(app)
    .post(`/api/trader/deposit-requests/${secDepId}/submit-evidence`)
    .set('Cookie', traderCookie)
    .send({ txHash: validTx2, screenshot: '/uploads/proof2.png' });

  // Admin approves Security Deposit
  const approveSec = await request(app)
    .patch(`/api/deposits/admin/${secDepId}/review`)
    .set('Cookie', adminCookie)
    .send({ action: 'APPROVE', decisionNotes: 'Approved security deposit' });
  assert.strictEqual(approveSec.status, 200);

  // Check trader wallet: Available USDT remains 500, Security Deposit becomes 1000
  wallet = await UsdtWallet.syncWithLedger(traderUser._id);
  normalVal = await wallet.toSubledgerValuation('NORMAL');
  assert.strictEqual(parseFloat(normalVal.availableBalance), 500);
  assert.strictEqual(parseFloat(normalVal.securityDepositBalance), 1000);

  // 3. Verify Crypto Dashboard isolation: No Crypto requests created, crypto balance unaffected
  const cryptoDeposits = await CryptoDepositRequest.find({ userId: traderUser._id });
  assert.strictEqual(cryptoDeposits.length, 0, 'No crypto requests created for normal deposits');
});
