const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../app');
const { setupTestDB, cleanupTestDB, clearCollections } = require('./setup');
const User = require('../models/User');
const UsdtWallet = require('../models/UsdtWallet');
const BalanceLedger = require('../models/BalanceLedger');
const CryptoCommercialSettings = require('../models/CryptoCommercialSettings');
const CryptoPaymentQR = require('../models/CryptoPaymentQR');
const CryptoDepositRequest = require('../models/CryptoDepositRequest');
const CryptoWithdrawalRequest = require('../models/CryptoWithdrawalRequest');
const DepositRequest = require('../models/DepositRequest');

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
    username: `admin_crypto_${timestamp}`,
    clientId: `admin_crypto_${timestamp}`,
    passwordHash: passHash,
    role: 'ADMIN',
    status: 'ACTIVE',
  });

  traderUser = await User.create({
    username: `trader_crypto_${timestamp}`,
    clientId: `trader_crypto_${timestamp}`,
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

  // Setup active Crypto QR for deposit testing
  await CryptoPaymentQR.create({
    qrId: 'CQR-TEST-SETTINGS-01',
    walletAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    network: 'TRC20',
    title: 'Official Crypto USDT TRC20 Wallet',
    qrImageUrl: '/uploads/official-crypto-qr.png',
    status: 'ACTIVE',
    isActive: true,
  });
});

test('Crypto Settings: 1. Default commercial settings initialize at Rate: ₹105, Deposit Bonus: +3%, Withdrawal Bonus: +1% (v1)', async () => {
  const settings = await CryptoCommercialSettings.getSettings();
  assert.equal(settings.usdtRateINR, 105.0);
  assert.equal(settings.depositBonusPercent, 3.0);
  assert.equal(settings.withdrawalBonusPercent, 1.0);
  assert.equal(settings.version, 1);

  // Check public / authenticated crypto rates endpoint
  const res = await request(app).get('/api/crypto/rates');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.baseRate, 105.0);
  assert.equal(res.body.depositBonusPercent, 3.0);
  assert.equal(res.body.withdrawalBonusPercent, 1.0);
  assert.equal(res.body.version, 1);
});

test('Crypto Settings: 2. Quotation calculations with default rates (3% Deposit Bonus, 1% Withdrawal Bonus)', async () => {
  // Test Deposit Quote for 100 USDT
  const depQuote = await request(app).get('/api/crypto/quote?type=DEPOSIT&amount=100');
  assert.equal(depQuote.status, 200);
  assert.equal(depQuote.body.success, true);
  assert.equal(depQuote.body.depositAmountUSDT, 100);
  assert.equal(depQuote.body.bonusPercent, 3);
  assert.equal(depQuote.body.bonusAmountUSDT, 3.0);
  assert.equal(depQuote.body.totalCreditUSDT, 103.0);
  assert.equal(depQuote.body.inrEquivalent, 10500.0);

  // Test Withdrawal Quote for 100 USDT
  const wdQuote = await request(app).get('/api/crypto/quote?type=WITHDRAWAL&amount=100');
  assert.equal(wdQuote.status, 200);
  assert.equal(wdQuote.body.success, true);
  assert.equal(wdQuote.body.requestedUSDT, 100);
  assert.equal(wdQuote.body.bonusPercent, 1);
  assert.equal(wdQuote.body.bonusUSDT, 1.0);
  assert.equal(wdQuote.body.balanceDebitUSDT, 99.0);
  assert.equal(wdQuote.body.finalInrPayout, 10500.0);
});

test('Crypto Settings: 3. Security & RBAC: Traders cannot modify crypto settings; Admin can update all 3 parameters', async () => {
  // Trader attempts to update settings -> 403 Forbidden
  const traderAttempt = await request(app)
    .patch('/api/crypto/admin/settings')
    .set('Cookie', traderCookie)
    .send({ usdtRateINR: 110, depositBonusPercent: 5, withdrawalBonusPercent: 2 });
  assert.equal(traderAttempt.status, 403);

  // Unauthenticated attempts -> 401 Unauthorized
  const unauthAttempt = await request(app)
    .patch('/api/crypto/admin/settings')
    .send({ usdtRateINR: 110 });
  assert.equal(unauthAttempt.status, 401);

  // Admin updates settings successfully
  const adminRes = await request(app)
    .patch('/api/crypto/admin/settings')
    .set('Cookie', adminCookie)
    .send({
      usdtRateINR: 110.50,
      depositBonusPercent: 5.0,
      withdrawalBonusPercent: 2.0,
      changeReason: 'Admin promotional boost',
    });
  assert.equal(adminRes.status, 200);
  assert.equal(adminRes.body.success, true);
  assert.equal(adminRes.body.data.usdtRateINR, 110.50);
  assert.equal(adminRes.body.data.depositBonusPercent, 5.0);
  assert.equal(adminRes.body.data.withdrawalBonusPercent, 2.0);
  assert.equal(adminRes.body.data.version, 2);
  assert.equal(adminRes.body.data.changeReason, 'Admin promotional boost');
});

test('Crypto Settings: 4. Validation rules: Reject negative rate, zero rate, bonus >= 100% on withdrawal', async () => {
  // Invalid rate (<= 0)
  const invRate = await request(app)
    .patch('/api/crypto/admin/settings')
    .set('Cookie', adminCookie)
    .send({ usdtRateINR: -10 });
  assert.equal(invRate.status, 400);

  // Invalid deposit bonus (> 100)
  const invDep = await request(app)
    .patch('/api/crypto/admin/settings')
    .set('Cookie', adminCookie)
    .send({ depositBonusPercent: 120 });
  assert.equal(invDep.status, 400);

  // Invalid withdrawal bonus (>= 100%)
  const invWd = await request(app)
    .patch('/api/crypto/admin/settings')
    .set('Cookie', adminCookie)
    .send({ withdrawalBonusPercent: 100 });
  assert.equal(invWd.status, 400);
});

test('Crypto Settings: 5. Partial update retains existing values for omitted fields', async () => {
  // First set known baseline
  await CryptoCommercialSettings.updateSettings({
    newRate: 108.0,
    newDepositBonus: 4.5,
    newWithdrawalBonus: 1.5,
    changeReason: 'Baseline',
    user: adminUser,
  });

  // Admin updates ONLY withdrawal bonus
  const patchRes = await request(app)
    .patch('/api/crypto/admin/settings')
    .set('Cookie', adminCookie)
    .send({ withdrawalBonusPercent: 2.5 });

  assert.equal(patchRes.status, 200);
  assert.equal(patchRes.body.data.withdrawalBonusPercent, 2.5);
  // Rate and deposit bonus must be preserved
  assert.equal(patchRes.body.data.usdtRateINR, 108.0);
  assert.equal(patchRes.body.data.depositBonusPercent, 4.5);
});

test('Crypto Settings: 6. Real-time Deposit workflow snapshots new rate & bonus and credits exact amount on approval', async () => {
  // Admin configures: Rate = ₹112.00, Deposit Bonus = 4.0%
  await request(app)
    .patch('/api/crypto/admin/settings')
    .set('Cookie', adminCookie)
    .send({ usdtRateINR: 112.0, depositBonusPercent: 4.0 });

  // Trader creates deposit request for 500 USDT
  const depSubmit = await request(app)
    .post('/api/crypto/deposits')
    .set('Cookie', traderCookie)
    .send({
      depositAmountUSDT: 500,
      network: 'TRC20',
      txHash: '0x9999888877776666555544443333222211110000aaaa',
    });

  assert.equal(depSubmit.status, 201);
  const createdReq = depSubmit.body.data;
  assert.equal(createdReq.depositAmountUSDT, 500);
  assert.equal(createdReq.bonusPercent, 4.0);
  assert.equal(createdReq.bonusAmountUSDT, 20.0); // 500 * 4% = 20 USDT
  assert.equal(createdReq.totalCreditUSDT, 520.0); // 500 + 20 = 520 USDT
  assert.equal(createdReq.baseRate, 112.0);
  assert.equal(createdReq.inrEquivalent, 56000.0); // 500 * 112 = 56,000

  // Admin approves deposit
  const approveRes = await request(app)
    .post(`/api/crypto/admin/deposits/${createdReq._id}/approve`)
    .set('Cookie', adminCookie)
    .send({ notes: 'Verified on TRON explorer' });

  assert.equal(approveRes.status, 200);

  // Verify wallet credited with exact snapshot totalCreditUSDT (520 USDT)
  const walletRes = await request(app)
    .get('/api/crypto/wallet')
    .set('Cookie', traderCookie);

  assert.equal(walletRes.status, 200);
  assert.equal(parseFloat(walletRes.body.availableBalance), 520.0);
  assert.equal(walletRes.body.rateINRPerUSDT, 112.0);
  assert.equal(parseFloat(walletRes.body.inrEquivalent), 58240.0); // 520 * 112 = 58,240
});

test('Crypto Settings: 7. Real-time Withdrawal workflow debits reduced amount from balance and obligations full payout', async () => {
  // Give trader 1,000 USDT via UsdtWallet
  await UsdtWallet.creditWallet({
    traderId: traderUser._id,
    clientId: traderUser.username,
    amount: 1000,
    entryType: 'ADMIN_ADJUSTMENT',
    systemType: 'CRYPTO',
    referenceRequestId: 'INIT-CWD-TEST-001',
    notes: 'Initial balance for withdrawal test',
    performedBy: adminUser._id,
  });

  // Admin sets: Rate = ₹110.00, Withdrawal Bonus = 2.0%
  await request(app)
    .patch('/api/crypto/admin/settings')
    .set('Cookie', adminCookie)
    .send({ usdtRateINR: 110.0, withdrawalBonusPercent: 2.0 });

  // Trader requests 500 USDT withdrawal
  // With 2% bonus:
  // requestedUSDT = 500
  // bonusUSDT = 500 * 0.02 = 10 USDT
  // balanceDebitUSDT = 500 - 10 = 490 USDT (98% of 500)
  // finalInrPayout = 500 * 110 = ₹55,000
  const wdSubmit = await request(app)
    .post('/api/crypto/withdrawals')
    .set('Cookie', traderCookie)
    .send({
      amount: 500,
      traderUpiId: 'trader@upi',
    });

  assert.equal(wdSubmit.status, 201);
  const createdWd = wdSubmit.body.data;
  assert.equal(createdWd.requestedUSDT, 500);
  assert.equal(createdWd.bonusPercent, 2.0);
  assert.equal(createdWd.bonusUSDT, 10.0);
  assert.equal(createdWd.balanceDebitUSDT, 490.0);
  assert.equal(createdWd.finalInrPayout, 55000.0);

  // Check trader wallet: 490 USDT reserved in lockedBalance
  const walletDuringReview = await request(app)
    .get('/api/crypto/wallet')
    .set('Cookie', traderCookie);

  assert.equal(parseFloat(walletDuringReview.body.availableBalance), 510.0); // 1000 - 490 = 510
  assert.equal(parseFloat(walletDuringReview.body.lockedBalance), 490.0);

  // Admin approves withdrawal
  const approveWd = await request(app)
    .patch(`/api/crypto/admin/withdrawals/${createdWd._id}/approve`)
    .set('Cookie', adminCookie)
    .send({ notes: 'Payout approved' });

  assert.equal(approveWd.status, 200);

  // Check ledger / wallet after approval: exactly 490 USDT debited permanently
  const walletAfterApprove = await request(app)
    .get('/api/crypto/wallet')
    .set('Cookie', traderCookie);

  assert.equal(parseFloat(walletAfterApprove.body.availableBalance), 510.0);
  assert.equal(parseFloat(walletAfterApprove.body.lockedBalance), 0.0);
  assert.equal(parseFloat(walletAfterApprove.body.totalBalance), 510.0);
});

test('Crypto Settings: 8. Immutability of past transaction snapshots when Admin updates rates again', async () => {
  // Give trader 1,000 USDT via UsdtWallet
  await UsdtWallet.creditWallet({
    traderId: traderUser._id,
    clientId: traderUser.username,
    amount: 1000,
    entryType: 'ADMIN_ADJUSTMENT',
    systemType: 'CRYPTO',
    referenceRequestId: 'INIT-CWD-TEST-002',
    notes: 'Initial balance for immutability test',
    performedBy: adminUser._id,
  });

  // Admin sets v1: Rate ₹105, 3% Dep Bonus, 1% Wd Bonus
  await request(app)
    .patch('/api/crypto/admin/settings')
    .set('Cookie', adminCookie)
    .send({ usdtRateINR: 105.0, depositBonusPercent: 3.0, withdrawalBonusPercent: 1.0 });

  // Trader creates deposit under v1
  const dep1 = await request(app)
    .post('/api/crypto/deposits')
    .set('Cookie', traderCookie)
    .send({
      depositAmountUSDT: 100,
      network: 'TRC20',
      txHash: '0xTX_IMMUTABLE_TEST_111111111111111111111111',
    });
  assert.equal(dep1.status, 201);
  assert.equal(dep1.body.data.bonusPercent, 3.0);
  assert.equal(dep1.body.data.totalCreditUSDT, 103.0);

  // Trader creates withdrawal under v1
  const wd1 = await request(app)
    .post('/api/crypto/withdrawals')
    .set('Cookie', traderCookie)
    .send({
      amount: 100,
      traderUpiId: 'trader1@upi',
    });
  assert.equal(wd1.status, 201);
  assert.equal(wd1.body.data.balanceDebitUSDT, 99.0);
  assert.equal(wd1.body.data.finalInrPayout, 10500.0);

  // Now Admin updates settings to v2: Rate ₹120, 6% Dep Bonus, 3% Wd Bonus
  const updateV2 = await request(app)
    .patch('/api/crypto/admin/settings')
    .set('Cookie', adminCookie)
    .send({ usdtRateINR: 120.0, depositBonusPercent: 6.0, withdrawalBonusPercent: 3.0 });
  assert.equal(updateV2.status, 200);

  // Verify historical deposit and withdrawal retain original values
  const fetchedDep = await CryptoDepositRequest.findById(dep1.body.data._id);
  assert.equal(fetchedDep.bonusPercent, 3.0);
  assert.equal(fetchedDep.totalCreditUSDT, 103.0);
  assert.equal(fetchedDep.baseRate, 105.0);

  const fetchedWd = await CryptoWithdrawalRequest.findById(wd1.body.data._id);
  assert.equal(fetchedWd.bonusPercent, 1.0);
  assert.equal(fetchedWd.balanceDebitUSDT, 99.0);
  assert.equal(fetchedWd.finalInrPayout, 10500.0);
  assert.equal(fetchedWd.baseRate, 105.0);

  // And new requests created now use v2 values!
  const dep2 = await request(app)
    .post('/api/crypto/deposits')
    .set('Cookie', traderCookie)
    .send({
      depositAmountUSDT: 100,
      network: 'TRC20',
      txHash: '0xTX_IMMUTABLE_TEST_222222222222222222222222',
    });
  assert.equal(dep2.status, 201);
  assert.equal(dep2.body.data.bonusPercent, 6.0);
  assert.equal(dep2.body.data.totalCreditUSDT, 106.0);
  assert.equal(dep2.body.data.baseRate, 120.0);
});

test('Crypto Settings: 9. Strict separation: UPI/Normal deposits and wallets are unaffected by Crypto settings', async () => {
  // Admin changes Crypto rate to ₹125
  await request(app)
    .patch('/api/crypto/admin/settings')
    .set('Cookie', adminCookie)
    .send({ usdtRateINR: 125.0 });

  // Normal UPI Deposit request created
  const upiDep = await DepositRequest.create({
    requestId: 'TDR-UPI-SEP-001',
    userId: traderUser._id,
    clientId: traderUser.username,
    traderId: traderUser._id,
    traderUsername: traderUser.username,
    depositType: 'WORKING_DEPOSIT',
    systemType: 'NORMAL',
    amount: 5000,
    amountINR: 5000,
    amountUSDT: 50,
    wallet: 'TPF1ZetizM3m9nnu7xkh2EczsL2fZ6b8Nd',
    currency: 'USDT',
    status: 'PENDING',
    paymentMethod: 'USDT_TRC20',
  });

  assert.equal(upiDep.systemType, 'NORMAL');
  assert.equal(upiDep.amount, 5000);

  // Subledger separation verified: crypto subledger has zero impact on normal working deposit
  const subledgerNormal = await BalanceLedger.calculateSubledgerBalance(traderUser._id, 'USDT', 'NORMAL');
  assert.equal(subledgerNormal, 0);
});

test('Crypto Settings: 10. Audit History endpoint returns full history with change reasons', async () => {
  await request(app)
    .patch('/api/crypto/admin/settings')
    .set('Cookie', adminCookie)
    .send({
      usdtRateINR: 109.0,
      depositBonusPercent: 3.5,
      withdrawalBonusPercent: 1.2,
      changeReason: 'Audit test reason #1',
    });

  await request(app)
    .patch('/api/crypto/admin/settings')
    .set('Cookie', adminCookie)
    .send({
      usdtRateINR: 111.0,
      depositBonusPercent: 4.0,
      withdrawalBonusPercent: 1.5,
      changeReason: 'Audit test reason #2',
    });

  const histRes = await request(app)
    .get('/api/crypto/admin/settings/history')
    .set('Cookie', adminCookie);

  assert.equal(histRes.status, 200);
  assert.equal(histRes.body.success, true);
  assert.ok(Array.isArray(histRes.body.data));
  assert.ok(histRes.body.data.length >= 2);
  assert.equal(histRes.body.data[0].changeReason, 'Audit test reason #2');
  assert.equal(histRes.body.data[0].usdtRateINR, 111.0);
  assert.equal(histRes.body.data[1].changeReason, 'Audit test reason #1');
});
