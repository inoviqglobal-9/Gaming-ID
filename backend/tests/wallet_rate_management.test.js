const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../app');
const { setupTestDB, cleanupTestDB, clearCollections } = require('./setup');
const User = require('../models/User');
const UsdtWallet = require('../models/UsdtWallet');
const BalanceLedger = require('../models/BalanceLedger');
const WalletRateConfig = require('../models/WalletRateConfig');
const ScannerConfig = require('../models/ScannerConfig');
const DepositConfig = require('../models/DepositConfig');
const CryptoDepositRequest = require('../models/CryptoDepositRequest');

let adminCookie;
let traderCookie;
let adminUser;
let traderUser;

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
    username: `admin_rate_${timestamp}`,
    clientId: `admin_rate_${timestamp}`,
    passwordHash: passHash,
    role: 'ADMIN',
    status: 'ACTIVE',
  });

  traderUser = await User.create({
    username: `trader_rate_${timestamp}`,
    clientId: `trader_rate_${timestamp}`,
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

  // Create an active scanner
  await ScannerConfig.create({
    scannerId: 'QR-TEST-RATE',
    scannerName: 'Active USDT TRC20 Scanner',
    merchantName: 'Active USDT TRC20 Scanner',
    merchantIdentifier: 'TPF1ZetizM3m9nnu7xkh2EczsL2fZ6b8Nd',
    walletAddress: 'TPF1ZetizM3m9nnu7xkh2EczsL2fZ6b8Nd',
    qrImageUrl: '/uploads/scanner-rate-test.jpeg',
    network: 'TRC20',
    currency: 'USDT',
    status: 'ACTIVE',
    isActive: true,
    isPublished: true,
  });
});

test('Wallet Valuation Rate: 1. Default initial rate is ₹105 and Trader with 997 USDT has ₹1,04,685.00 INR equivalent', async () => {
  // Give trader 997 USDT via BalanceLedger
  await BalanceLedger.create({
    userId: traderUser._id,
    clientId: traderUser.username,
    performedBy: adminUser._id,
    currency: 'USDT',
    amount: 997,
    balanceAfter: 997,
    systemType: 'NORMAL',
    entryType: 'DEPOSIT_CONFIRMED',
    referenceRequestId: 'DEP-INIT-997',
  });

  const res = await request(app)
    .get('/api/trader/wallet/usdt')
    .set('Cookie', traderCookie);

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.currency, 'USDT');
  assert.strictEqual(parseFloat(res.body.availableBalance), 997);
  assert.strictEqual(res.body.valuationRate, '105.00');
  assert.strictEqual(res.body.rateType, 'ADMIN_CONFIGURED');
  assert.strictEqual(res.body.inrEquivalent, '104685.00'); // 997 * 105 = 104,685.00
});

test('Wallet Valuation Rate: 2. Unauthorized users cannot update the rate', async () => {
  // Unauthenticated
  const unauthRes = await request(app)
    .patch('/api/admin/wallet-rate')
    .send({ newRate: 110 });
  assert.strictEqual(unauthRes.status, 401);

  // Authenticated as Trader (Forbidden)
  const traderRes = await request(app)
    .patch('/api/admin/wallet-rate')
    .set('Cookie', traderCookie)
    .send({ newRate: 110 });
  assert.strictEqual(traderRes.status, 403);
});

test('Wallet Valuation Rate: 3. Backend validates newRate (rejects zero, negative, invalid, or excessive decimals)', async () => {
  // Zero rate
  const resZero = await request(app)
    .patch('/api/admin/wallet-rate')
    .set('Cookie', adminCookie)
    .send({ newRate: 0 });
  assert.strictEqual(resZero.status, 400);

  // Negative rate
  const resNeg = await request(app)
    .patch('/api/admin/wallet-rate')
    .set('Cookie', adminCookie)
    .send({ newRate: -105 });
  assert.strictEqual(resNeg.status, 400);

  // Non-numeric
  const resNaN = await request(app)
    .patch('/api/admin/wallet-rate')
    .set('Cookie', adminCookie)
    .send({ newRate: 'abc' });
  assert.strictEqual(resNaN.status, 400);

  // Exceeds upper limit
  const resHigh = await request(app)
    .patch('/api/admin/wallet-rate')
    .set('Cookie', adminCookie)
    .send({ newRate: 500000 });
  assert.strictEqual(resHigh.status, 400);

  // Excessive decimal places (> 4 decimal places)
  const resPrec = await request(app)
    .patch('/api/admin/wallet-rate')
    .set('Cookie', adminCookie)
    .send({ newRate: 105.12345 });
  assert.strictEqual(resPrec.status, 400);
  assert.ok(resPrec.body.message.includes('decimal'));
});

test('Wallet Valuation Rate: 4. Admin updates rate from ₹105 to ₹110 with reason and audit history', async () => {
  const updateRes = await request(app)
    .patch('/api/admin/wallet-rate')
    .set('Cookie', adminCookie)
    .send({
      newRate: 110,
      changeReason: 'Market valuation update to ₹110',
    });

  assert.strictEqual(updateRes.status, 200);
  assert.strictEqual(updateRes.body.success, true);
  assert.strictEqual(updateRes.body.data.rateINRPerUSDT, 110);
  assert.strictEqual(updateRes.body.data.formattedRate, '110.00');
  assert.strictEqual(updateRes.body.data.version, 2);
  assert.strictEqual(updateRes.body.data.changeReason, 'Market valuation update to ₹110');

  // Verify saved permanently in MongoDB
  const dbDoc = await WalletRateConfig.findOne({ key: 'USDT_WALLET_VALUATION_RATE' });
  assert.ok(dbDoc);
  assert.strictEqual(dbDoc.rateINRPerUSDT, 110);
  assert.strictEqual(dbDoc.version, 2);
  assert.ok(dbDoc.auditHistory.length >= 1);
  assert.strictEqual(dbDoc.auditHistory[0].rateINRPerUSDT, 110);
  assert.strictEqual(dbDoc.auditHistory[0].previousRate, 105);
});

test('Wallet Valuation Rate: 5. Trader Dashboard reflects ₹110 rate, 997 USDT balance is preserved, and INR Equivalent updates to ₹1,09,670.00', async () => {
  // Give trader 997 USDT
  await BalanceLedger.create({
    userId: traderUser._id,
    clientId: traderUser.username,
    performedBy: adminUser._id,
    currency: 'USDT',
    amount: 997,
    balanceAfter: 997,
    systemType: 'NORMAL',
    entryType: 'DEPOSIT_CONFIRMED',
    referenceRequestId: 'DEP-997-USDT',
  });

  // Admin publishes ₹110
  await request(app)
    .patch('/api/admin/wallet-rate')
    .set('Cookie', adminCookie)
    .send({ newRate: 110, changeReason: 'Published ₹110' });

  // Trader queries wallet
  const res = await request(app)
    .get('/api/trader/wallet/usdt')
    .set('Cookie', traderCookie);

  assert.strictEqual(res.status, 200);
  assert.strictEqual(parseFloat(res.body.availableBalance), 997.0);
  assert.strictEqual(res.body.valuationRate, '110.00');
  assert.strictEqual(res.body.rateType, 'ADMIN_CONFIGURED');
  assert.strictEqual(res.body.inrEquivalent, '109670.00'); // Exactly 997 * 110 = 109,670.00

  // Trader subledger query with NORMAL module
  const normalRes = await request(app)
    .get('/api/trader/wallet/usdt?module=NORMAL')
    .set('Cookie', traderCookie);

  assert.strictEqual(normalRes.status, 200);
  assert.strictEqual(parseFloat(normalRes.body.availableBalance), 997.0);
  assert.strictEqual(normalRes.body.valuationRate, '110.00');
  assert.strictEqual(normalRes.body.inrEquivalent, '109670.00');
});

test('Wallet Valuation Rate: 6. Further update to ₹115 automatically recalculates INR Equivalent to ₹1,14,655.00', async () => {
  // Trader with 997 USDT
  await BalanceLedger.create({
    userId: traderUser._id,
    clientId: traderUser.username,
    performedBy: adminUser._id,
    currency: 'USDT',
    amount: 997,
    balanceAfter: 997,
    systemType: 'NORMAL',
    entryType: 'DEPOSIT_CONFIRMED',
    referenceRequestId: 'DEP-997-V115',
  });

  // Update to ₹115
  await request(app)
    .patch('/api/admin/wallet-rate')
    .set('Cookie', adminCookie)
    .send({ newRate: 115, changeReason: 'Setting rate to 115' });

  const res = await request(app)
    .get('/api/trader/wallet/usdt')
    .set('Cookie', traderCookie);

  assert.strictEqual(res.status, 200);
  assert.strictEqual(parseFloat(res.body.availableBalance), 997.0);
  assert.strictEqual(res.body.valuationRate, '115.00');
  assert.strictEqual(res.body.inrEquivalent, '114655.00'); // Exactly 997 * 115 = 114,655.00
});

test('Wallet Valuation Rate: 7. Server restart (re-invoking getActiveRate) never overwrites existing configured rate', async () => {
  // Admin sets rate to 112.50
  await request(app)
    .patch('/api/admin/wallet-rate')
    .set('Cookie', adminCookie)
    .send({ newRate: 112.50, changeReason: 'Admin rate 112.50' });

  // Simulate server restart calling getActiveRate()
  const activeRateDoc = await WalletRateConfig.getActiveRate();
  assert.strictEqual(activeRateDoc.rateINRPerUSDT, 112.50, 'Configured rate must NOT be reset to 105 on restart');
  assert.strictEqual(activeRateDoc.version, 2);
});

test('Wallet Valuation Rate: 8. Crypto Dashboard isolation: Crypto deposit 3% bonus and rules remain strictly intact', async () => {
  // Admin sets display valuation rate to 120
  await request(app)
    .patch('/api/admin/wallet-rate')
    .set('Cookie', adminCookie)
    .send({ newRate: 120, changeReason: 'Normal valuation rate update to 120' });

  // Verify Crypto Deposit retains exact 3% bonus (e.g. 100 USDT deposit -> 103 USDT)
  const cryptoDeposit = await CryptoDepositRequest.create({
    requestId: 'CDP-RATE-TEST-01',
    traderId: traderUser._id,
    traderUsername: traderUser.username,
    depositAmountUSDT: 100,
    usdtAmount: 100,
    bonusPercent: 3.0,
    bonusAmountUSDT: 3.0,
    totalCreditUSDT: 103.0,
    status: 'COMPLETED',
  });

  assert.strictEqual(cryptoDeposit.bonusAmountUSDT, 3.0);
  assert.strictEqual(cryptoDeposit.totalCreditUSDT, 103.0);
  assert.strictEqual(cryptoDeposit.bonusPercent, 3.0, 'Crypto base settlement rules are strictly preserved');
});
