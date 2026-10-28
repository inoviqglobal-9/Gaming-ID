const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const ScannerConfig = require('../models/ScannerConfig');
const PayInRequest = require('../models/PayInRequest');
const BalanceLedger = require('../models/BalanceLedger');
const Notification = require('../models/Notification');
const { seedDemoScanner } = require('../scripts/seedDemoScanner');
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

  // Create admin
  const adminHash = await User.hashPassword('AdminPass#123456');
  await User.create({ username: 'scanner_admin', passwordHash: adminHash, role: 'ADMIN', status: 'ACTIVE' });

  // Create client
  const clientHash = await User.hashPassword('ClientPass#123456');
  clientUser = await User.create({ username: 'trader_vip', passwordHash: clientHash, role: 'CLIENT', status: 'ACTIVE' });

  // Login admin
  const adminLogin = await request(app).post('/api/auth/login').send({ username: 'scanner_admin', password: 'AdminPass#123456' });
  adminCookie = adminLogin.headers['set-cookie'][0];

  // Login client
  const clientLogin = await request(app).post('/api/auth/login').send({ username: 'trader_vip', password: 'ClientPass#123456' });
  clientCookie = clientLogin.headers['set-cookie'][0];
});

test('Scenario 1: Default Demo Scanner is initialized and client sees DEMO warning', async () => {
  await seedDemoScanner();

  const res = await request(app)
    .get('/api/scanner/active')
    .set('Cookie', clientCookie);

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.scanner.scannerId, 'QR-DEMO-001');
  assert.strictEqual(res.body.scanner.mode, 'DEMO_ONLY');
  assert.strictEqual(res.body.scanner.isDemo, true);
  assert.ok(res.body.scanner.warningBanner.includes('DEMO ONLY — DO NOT PAY'));
});

test('Scenario 2: Admin uploads QR-1, publishes, activates -> Client receives QR-1', async () => {
  // 1. Create QR-1
  const createRes = await request(app)
    .post('/api/scanner/admin')
    .set('Cookie', adminCookie)
    .send({
      scannerName: 'PhonePe QR-1',
      merchantName: 'Merchant A Solutions',
      merchantIdentifier: 'merchantA@phonepe',
      mode: 'LIVE',
    });

  assert.strictEqual(createRes.status, 201);
  assert.strictEqual(createRes.body.scanner.status, 'DRAFT');
  assert.strictEqual(createRes.body.scanner.isActive, false);
  const qr1Id = createRes.body.scanner._id;

  // 2. Publish QR-1
  const pubRes = await request(app)
    .post(`/api/scanner/admin/${qr1Id}/publish`)
    .set('Cookie', adminCookie);
  assert.strictEqual(pubRes.status, 200);
  assert.strictEqual(pubRes.body.scanner.status, 'PUBLISHED');

  // 3. Activate QR-1
  const actRes = await request(app)
    .post(`/api/scanner/admin/${qr1Id}/activate`)
    .set('Cookie', adminCookie);
  assert.strictEqual(actRes.status, 200);
  assert.strictEqual(actRes.body.scanner.status, 'ACTIVE');
  assert.strictEqual(actRes.body.scanner.isActive, true);

  // 4. Client fetches active scanner
  const clientRes = await request(app)
    .get('/api/scanner/active')
    .set('Cookie', clientCookie);
  assert.strictEqual(clientRes.body.scanner.scannerName, 'PhonePe QR-1');
  assert.strictEqual(clientRes.body.scanner.merchantName, 'Merchant A Solutions');
});

test('Scenario 3: Option A (Replace Now) — Replace QR-1 with QR-2; Client now sees QR-2 for new payments', async () => {
  // Create & activate QR-1
  const qr1 = await ScannerConfig.create({
    scannerId: 'QR-001',
    scannerName: 'PhonePe QR-1',
    merchantName: 'Merchant A',
    status: 'ACTIVE',
    isActive: true,
    isPublished: true,
    mode: 'LIVE',
  });

  // Client creates payment under QR-1
  const payIn1 = await request(app)
    .post('/api/payin')
    .set('Cookie', clientCookie)
    .send({ amount: 5000, currency: 'INR' });
  assert.strictEqual(payIn1.body.payIn.merchantName, 'Merchant A');
  assert.strictEqual(payIn1.body.payIn.scannerId, 'QR-001');

  // Admin executes Option A — Replace QR-1 with QR-2
  const replaceRes = await request(app)
    .post(`/api/scanner/admin/${qr1._id}/replace`)
    .set('Cookie', adminCookie)
    .send({
      scannerName: 'PhonePe QR-2',
      merchantName: 'Merchant B Global',
      merchantIdentifier: 'merchantB@phonepe',
      mode: 'LIVE',
      archiveOld: true,
    });

  assert.strictEqual(replaceRes.status, 201);
  assert.strictEqual(replaceRes.body.newScanner.scannerName, 'PhonePe QR-2');
  assert.strictEqual(replaceRes.body.newScanner.isActive, true);

  // Verify QR-1 is automatically deactivated and archived
  const updatedQr1 = await ScannerConfig.findById(qr1._id);
  assert.strictEqual(updatedQr1.isActive, false);
  assert.strictEqual(updatedQr1.status, 'ARCHIVED');

  // Client creates new payment: MUST get QR-2 (Merchant B)!
  const payIn2 = await request(app)
    .post('/api/payin')
    .set('Cookie', clientCookie)
    .send({ amount: 8000, currency: 'INR' });
  assert.strictEqual(payIn2.body.payIn.merchantName, 'Merchant B Global');

  // Crucial Historical Safety Check: Prior payment payIn1 STILL references Merchant A!
  const priorPayment = await PayInRequest.findById(payIn1.body.payIn.id);
  assert.strictEqual(priorPayment.merchantName, 'Merchant A');
  assert.strictEqual(priorPayment.scannerId, 'QR-001');
});

test('Scenario 4: Option B (Delete First) — Deactivate, archive, shows unavailable, then add QR-2', async () => {
  const qr1 = await ScannerConfig.create({
    scannerId: 'QR-001',
    scannerName: 'PhonePe QR-1',
    merchantName: 'Merchant A',
    status: 'ACTIVE',
    isActive: true,
    isPublished: true,
    mode: 'LIVE',
  });

  // Admin deactivates & archives QR-1
  const delRes = await request(app)
    .delete(`/api/scanner/admin/${qr1._id}`)
    .set('Cookie', adminCookie)
    .send({ forceArchive: true });
  assert.strictEqual(delRes.status, 200);

  // When no scanner is active, client gets "Payments Unavailable"
  const activeCheck = await request(app)
    .get('/api/scanner/active')
    .set('Cookie', clientCookie);
  assert.strictEqual(activeCheck.body.isAvailable, false);
  assert.ok(activeCheck.body.message.includes('currently unavailable'));

  // Creating payment is blocked with 503
  const blockedPay = await request(app)
    .post('/api/payin')
    .set('Cookie', clientCookie)
    .send({ amount: 1000 });
  assert.strictEqual(blockedPay.status, 503);

  // Admin adds QR-2 and activates it
  const newQr = await ScannerConfig.create({
    scannerId: 'QR-002',
    scannerName: 'PhonePe QR-2',
    merchantName: 'Merchant B',
    status: 'ACTIVE',
    isActive: true,
    isPublished: true,
    mode: 'LIVE',
  });

  // Now payments are available with QR-2
  const readyCheck = await request(app)
    .get('/api/scanner/active')
    .set('Cookie', clientCookie);
  assert.strictEqual(readyCheck.body.isAvailable, true);
  assert.strictEqual(readyCheck.body.scanner.merchantName, 'Merchant B');
});

test('Scenario 5: Complete Payment Claim, Verification, ₹ Received Confirmation, & Notification Flow', async () => {
  // Setup active scanner
  await ScannerConfig.create({
    scannerId: 'QR-LIVE-99',
    scannerName: 'PhonePe Live Terminal',
    merchantName: 'Verified Merchant X',
    status: 'ACTIVE',
    isActive: true,
    isPublished: true,
    mode: 'LIVE',
  });

  // 1. Client creates PayIn
  const createPay = await request(app)
    .post('/api/payin')
    .set('Cookie', clientCookie)
    .send({ amount: 2500, currency: 'INR' });
  const payInId = createPay.body.payIn.id;

  // 2. Client submits UTR reference
  const submitRef = await request(app)
    .post(`/api/payin/${payInId}/submit-reference`)
    .set('Cookie', clientCookie)
    .send({ referenceId: '489201889922', notes: 'Paid from SBI account' });
  assert.strictEqual(submitRef.status, 200);
  assert.strictEqual(submitRef.body.payIn.status, 'PENDING_VERIFICATION');

  // Verify client received notification: PAYMENT_PENDING_VERIFICATION
  const notifs1 = await request(app)
    .get('/api/notifications')
    .set('Cookie', clientCookie);
  assert.strictEqual(notifs1.body.unreadCount, 1);
  assert.strictEqual(notifs1.body.notifications[0].type, 'PAYMENT_PENDING_VERIFICATION');

  // 3. Admin verifies and clicks "₹ Received — Confirm Payment"
  const confirmRes = await request(app)
    .patch(`/api/payin/admin/${payInId}/review`)
    .set('Cookie', adminCookie)
    .send({
      action: 'CONFIRM',
      decisionNotes: 'Verified on PhonePe Business settlement report',
      verificationEvidence: 'Settlement matched on statement',
    });
  assert.strictEqual(confirmRes.status, 200);
  assert.strictEqual(confirmRes.body.payIn.status, 'CONFIRMED');
  assert.strictEqual(confirmRes.body.payIn.adminConfirmationStatus, 'ADMIN_CONFIRMED');

  // 4. Verify BalanceLedger was credited
  const availableBal = await BalanceLedger.calculateAvailableBalance(clientUser._id, 'INR');
  assert.strictEqual(availableBal, 2500);

  // 5. Verify Client received PAYMENT_CONFIRMED notification
  const notifs2 = await request(app)
    .get('/api/notifications')
    .set('Cookie', clientCookie);
  assert.strictEqual(notifs2.body.notifications[0].type, 'PAYMENT_CONFIRMED');
  assert.ok(notifs2.body.notifications[0].title.includes('₹ Received'));
});
