const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const UsdtWallet = require('../models/UsdtWallet');
const BalanceLedger = require('../models/BalanceLedger');
const CryptoPaymentQR = require('../models/CryptoPaymentQR');
const CryptoDepositRequest = require('../models/CryptoDepositRequest');
const CryptoWithdrawalRequest = require('../models/CryptoWithdrawalRequest');
const CryptoActivityLog = require('../models/CryptoActivityLog');
const { setupTestDB, cleanupTestDB, clearCollections } = require('./setup');

let adminCookie;
let trader1Cookie;
let trader2Cookie;
let trader1Id;
let trader2Id;
let adminId;

test.before(async () => {
  await setupTestDB();
});

test.after(async () => {
  await cleanupTestDB();
});

test.beforeEach(async () => {
  await clearCollections();

  // Create Admin
  const adminHash = await User.hashPassword('AdminPass#123456');
  const admin = await User.create({
    username: 'crypto_admin',
    passwordHash: adminHash,
    role: 'ADMIN',
    status: 'ACTIVE',
  });
  adminId = admin._id;

  // Create Trader 1
  const trader1Hash = await User.hashPassword('Trader1Pass#123456');
  const trader1 = await User.create({
    username: 'trader101',
    passwordHash: trader1Hash,
    role: 'CLIENT',
    status: 'ACTIVE',
  });
  trader1Id = trader1._id;

  // Create Trader 2
  const trader2Hash = await User.hashPassword('Trader2Pass#123456');
  const trader2 = await User.create({
    username: 'trader102',
    passwordHash: trader2Hash,
    role: 'CLIENT',
    status: 'ACTIVE',
  });
  trader2Id = trader2._id;

  // Logins
  const aRes = await request(app)
    .post('/api/auth/login')
    .send({ username: 'crypto_admin', password: 'AdminPass#123456' });
  adminCookie = aRes.headers['set-cookie'] ? aRes.headers['set-cookie'][0] : '';

  const t1Res = await request(app)
    .post('/api/auth/login')
    .send({ username: 'trader101', password: 'Trader1Pass#123456' });
  trader1Cookie = t1Res.headers['set-cookie'] ? t1Res.headers['set-cookie'][0] : '';

  const t2Res = await request(app)
    .post('/api/auth/login')
    .send({ username: 'trader102', password: 'Trader2Pass#123456' });
  trader2Cookie = t2Res.headers['set-cookie'] ? t2Res.headers['set-cookie'][0] : '';

  // Seed initial active USDT QR for tests
  await CryptoPaymentQR.create({
    qrId: 'CQR-TEST-SEED',
    walletAddress: 'TX7D7vH3qV8kYq4eR9P4dE8vL3kYq4eR9P',
    qrImageUrl: '/uploads/official-usdt-trc20-qr.png',
    network: 'TRC20',
    title: 'Official USDT TRC20 Wallet',
    isActive: true,
  });
});

// TEST 1: Rates & Bonus configuration
test('Crypto: Fixed Base Rate ₹105, 0% deposit bonus (0% fee, exact 1:1), 0% withdrawal fee, +1% withdrawal bonus', async () => {
  const res = await request(app).get('/api/crypto/rates');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.baseRate, 105);
  assert.strictEqual(res.body.depositBonusPercent, 0);
  assert.strictEqual(res.body.depositFeePercent, 0);
  assert.strictEqual(res.body.withdrawalFeePercent, 0);
  assert.strictEqual(res.body.withdrawalBonusPercent, 1);
  assert.strictEqual(res.body.effectiveWithdrawalRate, 105);
  assert.deepStrictEqual(res.body.fixedWithdrawalAmounts, [100, 200, 300, 500, 800, 1000, 2000, 3000, 5000, 10000]);
});

// TEST 2: Withdrawal Config endpoint
test('Crypto: GET /api/crypto/withdrawal-config returns 10 fixed amounts and 1% bonus', async () => {
  const res = await request(app).get('/api/crypto/withdrawal-config');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.baseRate, 105);
  assert.strictEqual(res.body.withdrawalBonusPercent, 1);
  assert.strictEqual(res.body.withdrawalFeePercent, 0);
  assert.deepStrictEqual(res.body.fixedWithdrawalAmounts, [100, 200, 300, 500, 800, 1000, 2000, 3000, 5000, 10000]);
});

// TEST 3: Dynamic Deposit Live Quotation (Exact 1:1 Credit, Fixed ₹105 Rate, INR Equivalent)
test('Crypto: Live quotation for dynamic deposits (100 USDT and 750 USDT) calculates exact 1:1 credit and INR equivalent at ₹105', async () => {
  // Case A: 100 USDT -> 100 USDT credit, inrEquivalent = 10,500
  const res100 = await request(app).get('/api/crypto/quote?type=DEPOSIT&amount=100');
  assert.strictEqual(res100.status, 200);
  assert.strictEqual(res100.body.success, true);
  assert.strictEqual(res100.body.type, 'DEPOSIT');
  assert.strictEqual(res100.body.depositAmountUSDT, 100);
  assert.strictEqual(res100.body.bonusPercent, 0);
  assert.strictEqual(res100.body.bonusAmountUSDT, 0);
  assert.strictEqual(res100.body.totalCreditUSDT, 100);
  assert.strictEqual(res100.body.expectedUsdtCredit, 100);
  assert.strictEqual(res100.body.inrEquivalent, 10500);
  assert.strictEqual(res100.body.feePercent, 0);

  // Case B: 750 USDT -> 750 USDT credit, inrEquivalent = 78,750
  const res750 = await request(app).get('/api/crypto/quote?type=DEPOSIT&amount=750');
  assert.strictEqual(res750.status, 200);
  assert.strictEqual(res750.body.success, true);
  assert.strictEqual(res750.body.depositAmountUSDT, 750);
  assert.strictEqual(res750.body.bonusAmountUSDT, 0);
  assert.strictEqual(res750.body.totalCreditUSDT, 750);
  assert.strictEqual(res750.body.inrEquivalent, 78750);
});

// TEST 4: Withdrawal Live Quotation with 1% Bonus
test('Crypto: Live quotation for 1000 USDT withdrawal gives +10 USDT bonus, 990 USDT debit, and full ₹105,000 payout', async () => {
  const res = await request(app).get('/api/crypto/quote?type=WITHDRAWAL&amount=1000');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.type, 'WITHDRAWAL');
  assert.strictEqual(res.body.requestedUSDT, 1000);
  assert.strictEqual(res.body.bonusPercent, 1);
  assert.strictEqual(res.body.bonusUSDT, 10);
  assert.strictEqual(res.body.balanceDebitUSDT, 990);
  assert.strictEqual(res.body.payoutUSDTEquivalent, 1000);
  assert.strictEqual(res.body.finalInrPayout, 105000);
  assert.strictEqual(res.body.withdrawalFeePercent, 0);
  assert.strictEqual(res.body.deductionPercent, 0);
});

// TEST 5: Admin uploads USDT payment QR with 2 fields (walletAddress + qrImage), auto-activates, deactivates previous
test('Crypto: Admin uploads USDT payment QR with ONLY 2 fields, auto-activates, and updates trader view', async () => {
  const newAddress = 'TLJ3G1oYp9fM3yN2w8rE7tU5iP1oYp9fM3';
  const createQrRes = await request(app)
    .post('/api/crypto/admin/qrs')
    .set('Cookie', adminCookie)
    .field('walletAddress', newAddress)
    .attach('qrImage', Buffer.from('fake image content'), 'usdt_qr.png');

  assert.strictEqual(createQrRes.status, 201);
  assert.strictEqual(createQrRes.body.success, true);
  assert.strictEqual(createQrRes.body.data.walletAddress, newAddress);
  assert.strictEqual(createQrRes.body.data.isActive, true);

  // Verify previous QR was marked inactive
  const allQrs = await CryptoPaymentQR.find();
  const activeQrs = allQrs.filter((q) => q.isActive);
  assert.strictEqual(activeQrs.length, 1);
  assert.strictEqual(activeQrs[0].walletAddress, newAddress);

  // Trader retrieves active QR
  const traderQrRes = await request(app)
    .get('/api/crypto/deposit-qr')
    .set('Cookie', trader1Cookie);

  assert.strictEqual(traderQrRes.status, 200);
  assert.strictEqual(traderQrRes.body.success, true);
  assert.strictEqual(traderQrRes.body.data.walletAddress, newAddress);
  assert.strictEqual(traderQrRes.body.data.network, 'TRC20');
});

// TEST 5B: Validates USDT wallet address format
test('Crypto: Rejects invalid USDT wallet address on upload', async () => {
  const invalidRes = await request(app)
    .post('/api/crypto/admin/qrs')
    .set('Cookie', adminCookie)
    .field('walletAddress', 'InvalidShortAddress')
    .attach('qrImage', Buffer.from('fake image content'), 'usdt_qr.png');

  assert.strictEqual(invalidRes.status, 400);
  assert.strictEqual(invalidRes.body.success, false);
});

// TEST 5C: QR data verification check
test('Crypto: Rejects upload if decoded QR content does not match entered wallet address', async () => {
  const mismatchRes = await request(app)
    .post('/api/crypto/admin/qrs')
    .set('Cookie', adminCookie)
    .field('walletAddress', 'TLJ3G1oYp9fM3yN2w8rE7tU5iP1oYp9fM3')
    .field('qrDecodedAddress', 'TDifferentAddressAltogether9999999')
    .attach('qrImage', Buffer.from('fake image content'), 'usdt_qr.png');

  assert.strictEqual(mismatchRes.status, 400);
  assert.strictEqual(mismatchRes.body.success, false);
  assert.ok(mismatchRes.body.message.includes('QR code verification failed'));
});

// TEST 5D: Admin deletes active QR; trader view receives data: null
test('Crypto: Admin deletes active QR, trader receives null active QR and deposit is blocked', async () => {
  const activeQr = await CryptoPaymentQR.findOne({ isActive: true });
  assert.ok(activeQr);

  const delRes = await request(app)
    .delete(`/api/crypto/admin/qrs/${activeQr._id}`)
    .set('Cookie', adminCookie);

  assert.strictEqual(delRes.status, 200);
  assert.strictEqual(delRes.body.success, true);

  // Trader active QR returns data: null
  const traderQrRes = await request(app)
    .get('/api/crypto/deposit-qr')
    .set('Cookie', trader1Cookie);

  assert.strictEqual(traderQrRes.status, 200);
  assert.strictEqual(traderQrRes.body.success, true);
  assert.strictEqual(traderQrRes.body.data, null);
  assert.strictEqual(traderQrRes.body.message, 'No active USDT deposit wallet is currently available.');

  // Trader deposit attempt is blocked with 400
  const blockedDep = await request(app)
    .post('/api/crypto/deposits')
    .set('Cookie', trader1Cookie)
    .field('amount', 500)
    .field('txHash', '0xblockedhash123');

  assert.strictEqual(blockedDep.status, 400);
  assert.strictEqual(blockedDep.body.success, false);
  assert.ok(blockedDep.body.message.includes('No active USDT deposit wallet is currently available'));
});

// TEST 6: Trader submits dynamic deposit request with TXID and exact 1:1 credit calculation
test('Crypto: Trader submits dynamic 750 USDT deposit request with TXID, network, and exact 1:1 credit', async () => {
  const depRes = await request(app)
    .post('/api/crypto/deposits')
    .set('Cookie', trader1Cookie)
    .field('amount', 750)
    .field('network', 'TRC20')
    .field('txHash', '0xabc123789456def9988')
    .attach('proofImage', Buffer.from('screenshot bytes'), 'deposit_receipt.jpg');

  assert.strictEqual(depRes.status, 201);
  assert.strictEqual(depRes.body.success, true);
  assert.strictEqual(depRes.body.data.status, 'PENDING_VERIFICATION');
  assert.strictEqual(depRes.body.data.depositAmountUSDT, 750);
  assert.strictEqual(depRes.body.data.bonusPercent, 0);
  assert.strictEqual(depRes.body.data.bonusAmountUSDT, 0);
  assert.strictEqual(depRes.body.data.totalCreditUSDT, 750);
  assert.strictEqual(depRes.body.data.inrEquivalent, 78750);
  assert.strictEqual(depRes.body.data.network, 'TRC20');
  assert.strictEqual(depRes.body.data.txHash, '0xabc123789456def9988');
});

// TEST 6B: Dynamic fractional deposit amount supported (e.g. 125.50 USDT)
test('Crypto: Dynamic fractional deposit amount (125.50 USDT) calculates exact 1:1 credit (125.50) and INR equivalent (13,177.50)', async () => {
  const depRes = await request(app)
    .post('/api/crypto/deposits')
    .set('Cookie', trader1Cookie)
    .field('amount', 125.50)
    .field('network', 'TRC20')
    .field('txHash', '0xfractional12550txid');

  assert.strictEqual(depRes.status, 201);
  assert.strictEqual(depRes.body.success, true);
  assert.strictEqual(depRes.body.data.depositAmountUSDT, 125.5);
  assert.strictEqual(depRes.body.data.bonusAmountUSDT, 0);
  assert.strictEqual(depRes.body.data.totalCreditUSDT, 125.5);
  assert.strictEqual(depRes.body.data.inrEquivalent, 13177.5);
});

// TEST 7: Admin approves deposit and credits exact verified USDT (750 USDT)
test('Crypto: Admin approves deposit request: atomically credits exact verified USDT (750 USDT) to wallet and ledger', async () => {
  const dep = await CryptoDepositRequest.create({
    requestId: 'CDP-TEST-001',
    traderId: trader1Id,
    traderUsername: 'trader101',
    depositAmountUSDT: 750,
    usdtAmount: 750,
    bonusPercent: 0,
    bonusAmountUSDT: 0,
    totalCreditUSDT: 750,
    fixedRate: 105.0,
    inrEquivalent: 78750.0,
    network: 'TRC20',
    destinationWalletAddress: 'TX7D7vH3qV8kYq4eR9P4dE8vL3kYq4eR9P',
    paymentProofUrl: '/uploads/fake.png',
    txHash: '0x9988112233aabbcc',
    status: 'PENDING_VERIFICATION',
  });

  const approveRes = await request(app)
    .post(`/api/crypto/admin/deposits/${dep._id}/approve`)
    .set('Cookie', adminCookie)
    .send({ notes: 'Verified on TronScan blockchain explorer.' });

  assert.strictEqual(approveRes.status, 200);
  assert.strictEqual(approveRes.body.success, true);
  assert.strictEqual(approveRes.body.data.status, 'COMPLETED');

  // Verify trader wallet is credited with exact 750 USDT
  const wallet = await UsdtWallet.findOne({ traderId: trader1Id });
  assert.strictEqual(parseFloat(wallet.availableBalance.toString()), 750);
  assert.strictEqual(parseFloat(wallet.totalBalance.toString()), 750);

  // Verify BalanceLedger has entry
  const ledgerEntry = await BalanceLedger.findOne({
    referenceRequestId: dep.requestId,
    entryType: 'CRYPTO_DEPOSIT_CONFIRMED',
  });
  assert.ok(ledgerEntry);
  assert.strictEqual(ledgerEntry.amount, 750);
});

// TEST 8: Unsupported withdrawal amounts are rejected
test('Crypto: Unsupported custom withdrawal amount (e.g. 450 USDT) is rejected', async () => {
  const wdRes = await request(app)
    .post('/api/crypto/withdrawals')
    .set('Cookie', trader1Cookie)
    .field('amount', 450)
    .field('traderUpiId', 'trader@upi')
    .attach('traderQrImage', Buffer.from('qr bytes'), 'trader_qr.png');

  assert.strictEqual(wdRes.status, 400);
  assert.strictEqual(wdRes.body.success, false);
  assert.ok(wdRes.body.message.includes('Unsupported withdrawal amount'));
});

// TEST 9: 100 USDT request reserves 99 USDT (Task 12 case 2)
test('Crypto: 100 USDT request reserves 99 USDT', async () => {
  const w = await UsdtWallet.getOrCreate(trader1Id);
  w.availableBalance = mongoose.Types.Decimal128.fromString('100.000000');
  w.lockedBalance = mongoose.Types.Decimal128.fromString('0.000000');
  w.totalBalance = mongoose.Types.Decimal128.fromString('100.000000');
  await w.save();

  const wdRes = await request(app)
    .post('/api/crypto/withdrawals')
    .set('Cookie', trader1Cookie)
    .field('amount', 100)
    .field('traderUpiId', 'trader101@upi')
    .attach('traderQrImage', Buffer.from('qr bytes'), 'trader_qr.png');

  assert.strictEqual(wdRes.status, 201);
  assert.strictEqual(wdRes.body.success, true);
  assert.strictEqual(wdRes.body.data.requestedUSDT, 100);
  assert.strictEqual(wdRes.body.data.bonusUSDT, 1);
  assert.strictEqual(wdRes.body.data.balanceDebitUSDT, 99);
  assert.strictEqual(wdRes.body.data.payoutUSDTEquivalent, 100);
  assert.strictEqual(wdRes.body.data.finalInrPayout, 10500);

  // Check wallet: available = 1, locked = 99, total = 100
  const wallet = await UsdtWallet.findOne({ traderId: trader1Id });
  assert.strictEqual(parseFloat(wallet.availableBalance.toString()), 1);
  assert.strictEqual(parseFloat(wallet.lockedBalance.toString()), 99);
  assert.strictEqual(parseFloat(wallet.totalBalance.toString()), 100);
});

// TEST 10: 500 USDT request reserves 495 USDT (Task 12 case 3)
test('Crypto: 500 USDT request reserves 495 USDT', async () => {
  const w = await UsdtWallet.getOrCreate(trader1Id);
  w.availableBalance = mongoose.Types.Decimal128.fromString('500.000000');
  w.lockedBalance = mongoose.Types.Decimal128.fromString('0.000000');
  w.totalBalance = mongoose.Types.Decimal128.fromString('500.000000');
  await w.save();

  const wdRes = await request(app)
    .post('/api/crypto/withdrawals')
    .set('Cookie', trader1Cookie)
    .field('amount', 500)
    .field('traderUpiId', 'trader101@upi');

  assert.strictEqual(wdRes.status, 201);
  assert.strictEqual(wdRes.body.success, true);
  assert.strictEqual(wdRes.body.data.requestedUSDT, 500);
  assert.strictEqual(wdRes.body.data.bonusUSDT, 5);
  assert.strictEqual(wdRes.body.data.balanceDebitUSDT, 495);
  assert.strictEqual(wdRes.body.data.finalInrPayout, 52500);

  // Check wallet: available = 5, locked = 495, total = 500
  const wallet = await UsdtWallet.findOne({ traderId: trader1Id });
  assert.strictEqual(parseFloat(wallet.availableBalance.toString()), 5);
  assert.strictEqual(parseFloat(wallet.lockedBalance.toString()), 495);
  assert.strictEqual(parseFloat(wallet.totalBalance.toString()), 500);
});

// TEST 11: A 990 USDT balance permits a 1000 USDT request (Task 12 case 4 & 5)
test('Crypto: A 990 USDT balance permits a 1000 USDT request (reserves 990 USDT)', async () => {
  const w = await UsdtWallet.getOrCreate(trader1Id);
  w.availableBalance = mongoose.Types.Decimal128.fromString('990.000000');
  w.lockedBalance = mongoose.Types.Decimal128.fromString('0.000000');
  w.totalBalance = mongoose.Types.Decimal128.fromString('990.000000');
  await w.save();

  const wdRes = await request(app)
    .post('/api/crypto/withdrawals')
    .set('Cookie', trader1Cookie)
    .field('amount', 1000)
    .field('traderUpiId', 'trader101@upi')
    .attach('traderQrImage', Buffer.from('qr bytes'), 'trader_qr.png');

  assert.strictEqual(wdRes.status, 201);
  assert.strictEqual(wdRes.body.success, true);
  assert.strictEqual(wdRes.body.data.requestedUSDT, 1000);
  assert.strictEqual(wdRes.body.data.bonusUSDT, 10);
  assert.strictEqual(wdRes.body.data.balanceDebitUSDT, 990);
  assert.strictEqual(wdRes.body.data.payoutUSDTEquivalent, 1000);
  assert.strictEqual(wdRes.body.data.finalInrPayout, 105000);

  // Check wallet: available = 0, locked = 990, total = 990
  const wallet = await UsdtWallet.findOne({ traderId: trader1Id });
  assert.strictEqual(parseFloat(wallet.availableBalance.toString()), 0);
  assert.strictEqual(parseFloat(wallet.lockedBalance.toString()), 990);
  assert.strictEqual(parseFloat(wallet.totalBalance.toString()), 990);
});

// TEST 12: A balance below 990 USDT blocks that request (Task 12 case 6)
test('Crypto: A balance below 990 USDT (e.g. 989 USDT) blocks a 1000 USDT request', async () => {
  const w = await UsdtWallet.getOrCreate(trader1Id);
  w.availableBalance = mongoose.Types.Decimal128.fromString('989.000000');
  w.lockedBalance = mongoose.Types.Decimal128.fromString('0.000000');
  w.totalBalance = mongoose.Types.Decimal128.fromString('989.000000');
  await w.save();

  const wdRes = await request(app)
    .post('/api/crypto/withdrawals')
    .set('Cookie', trader1Cookie)
    .field('amount', 1000)
    .field('traderUpiId', 'trader101@upi');

  assert.strictEqual(wdRes.status, 400);
  assert.strictEqual(wdRes.body.success, false);
  assert.ok(wdRes.body.message.includes('Insufficient available'));
});

// TEST 13: Approval preserves the reserved balance (Task 12 case 10)
test('Crypto: Admin approval preserves the reserved balance and sets status APPROVED', async () => {
  const w = await UsdtWallet.getOrCreate(trader1Id);
  w.availableBalance = mongoose.Types.Decimal128.fromString('10.000000');
  w.lockedBalance = mongoose.Types.Decimal128.fromString('990.000000');
  w.totalBalance = mongoose.Types.Decimal128.fromString('1000.000000');
  await w.save();

  const wd = await CryptoWithdrawalRequest.create({
    requestId: 'CWD-TEST-APPROVE-1',
    traderId: trader1Id,
    traderUsername: 'trader101',
    usdtAmount: 1000,
    requestedUSDT: 1000,
    bonusPercent: 1,
    bonusUSDT: 10,
    balanceDebitUSDT: 990,
    payoutUSDTEquivalent: 1000,
    settlementMethod: 'UPI_INR',
    settlementRateINR: 105,
    payoutINR: 105000,
    baseRate: 105,
    baseInrAmount: 105000,
    finalInrPayout: 105000,
    effectiveRate: 105,
    traderUpiId: 'trader101@upi',
    status: 'PENDING_REVIEW',
  });

  const approveRes = await request(app)
    .patch(`/api/crypto/admin/withdrawals/${wd._id}/approve`)
    .set('Cookie', adminCookie)
    .send({ notes: 'Verified QR and trader account' });

  assert.strictEqual(approveRes.status, 200);
  assert.strictEqual(approveRes.body.success, true);
  assert.strictEqual(approveRes.body.data.status, 'APPROVED');

  // Verify wallet locked balance is preserved at 990 USDT
  const wallet = await UsdtWallet.findOne({ traderId: trader1Id });
  assert.strictEqual(parseFloat(wallet.availableBalance.toString()), 10);
  assert.strictEqual(parseFloat(wallet.lockedBalance.toString()), 990);
  assert.strictEqual(parseFloat(wallet.totalBalance.toString()), 1000);
});

// TEST 14: Payment completion finalizes 99% debit exactly once and records bonus (Task 12 case 12)
test('Crypto: Admin completes payout with UTR: debits locked 99% USDT permanently and records 1% bonus', async () => {
  await UsdtWallet.creditWallet({
    traderId: trader1Id,
    clientId: 'trader101',
    amount: 1000,
    referenceRequestId: 'TEST-INIT-CREDIT-1000',
    notes: 'Initial test funding',
    performedBy: adminId,
  });

  // Reserve 990 USDT (for 1000 USDT request)
  await UsdtWallet.reserveBalance({
    traderId: trader1Id,
    amount: 990,
  });

  const wd = await CryptoWithdrawalRequest.create({
    requestId: 'CWD-TEST-COMPLETE-1',
    traderId: trader1Id,
    traderUsername: 'trader101',
    usdtAmount: 1000,
    requestedUSDT: 1000,
    bonusPercent: 1,
    bonusUSDT: 10,
    balanceDebitUSDT: 990,
    payoutUSDTEquivalent: 1000,
    settlementMethod: 'UPI_INR',
    settlementRateINR: 105,
    payoutINR: 105000,
    baseRate: 105,
    baseInrAmount: 105000,
    finalInrPayout: 105000,
    effectiveRate: 105,
    traderUpiId: 'trader101@upi',
    status: 'APPROVED',
  });

  const completeRes = await request(app)
    .patch(`/api/crypto/admin/withdrawals/${wd._id}/complete`)
    .set('Cookie', adminCookie)
    .send({ payoutReference: 'PHONEPE-UTR-88291039', notes: 'Full payout ₹105,000 sent' });

  assert.strictEqual(completeRes.status, 200);
  assert.strictEqual(completeRes.body.success, true);
  assert.strictEqual(completeRes.body.data.status, 'COMPLETED');
  assert.strictEqual(completeRes.body.data.payoutReference, 'PHONEPE-UTR-88291039');

  // Verify wallet: available = 10, locked = 0, total = 10
  const wallet = await UsdtWallet.findOne({ traderId: trader1Id });
  assert.strictEqual(parseFloat(wallet.availableBalance.toString()), 10);
  assert.strictEqual(parseFloat(wallet.lockedBalance.toString()), 0);
  assert.strictEqual(parseFloat(wallet.totalBalance.toString()), 10);

  // Verify BalanceLedger has debit of -990
  const ledgerDebit = await BalanceLedger.findOne({
    referenceRequestId: wd.requestId,
    entryType: 'CRYPTO_WITHDRAWAL_DEDUCTED',
  });
  assert.ok(ledgerDebit);
  assert.strictEqual(ledgerDebit.amount, -990);

  // Verify bonus activity log recorded
  const bonusLog = await CryptoActivityLog.findOne({
    requestId: wd.requestId,
    actionType: 'WITHDRAWAL_BONUS_RECORDED',
  });
  assert.ok(bonusLog);
  assert.strictEqual(bonusLog.details.bonusUSDT, 10);
});

// TEST 15: Rejection restores the reserved 99% exactly once (Task 12 case 11)
test('Crypto: Rejected withdrawal restores locked 99% USDT back to available balance atomically', async () => {
  await UsdtWallet.creditWallet({
    traderId: trader1Id,
    clientId: 'trader101',
    amount: 1000,
    referenceRequestId: 'TEST-INIT-CREDIT-REJECT',
    notes: 'Initial test funding',
    performedBy: adminId,
  });

  // Reserve 990 USDT
  await UsdtWallet.reserveBalance({
    traderId: trader1Id,
    amount: 990,
  });

  const wd = await CryptoWithdrawalRequest.create({
    requestId: 'CWD-TEST-REJECT-1',
    traderId: trader1Id,
    traderUsername: 'trader101',
    usdtAmount: 1000,
    requestedUSDT: 1000,
    bonusPercent: 1,
    bonusUSDT: 10,
    balanceDebitUSDT: 990,
    payoutUSDTEquivalent: 1000,
    settlementMethod: 'UPI_INR',
    settlementRateINR: 105,
    payoutINR: 105000,
    baseRate: 105,
    baseInrAmount: 105000,
    finalInrPayout: 105000,
    effectiveRate: 105,
    traderUpiId: 'trader101@upi',
    status: 'PENDING_REVIEW',
  });

  const rejectRes = await request(app)
    .patch(`/api/crypto/admin/withdrawals/${wd._id}/reject`)
    .set('Cookie', adminCookie)
    .send({ reason: 'Incorrect UPI ID destination' });

  assert.strictEqual(rejectRes.status, 200);
  assert.strictEqual(rejectRes.body.success, true);
  assert.strictEqual(rejectRes.body.data.status, 'REJECTED');

  // Verify wallet: locked is 0, available is restored to 1000!
  const wallet = await UsdtWallet.findOne({ traderId: trader1Id });
  assert.strictEqual(parseFloat(wallet.availableBalance.toString()), 1000);
  assert.strictEqual(parseFloat(wallet.lockedBalance.toString()), 0);
  assert.strictEqual(parseFloat(wallet.totalBalance.toString()), 1000);
});

// TEST 16: Security & Isolation: Trader cannot access another trader's or admin endpoints
test('Crypto: Security & Trader Isolation: Trader cannot access admin crypto endpoints', async () => {
  const forbiddenRes = await request(app)
    .get('/api/crypto/admin/overview')
    .set('Cookie', trader1Cookie);
  assert.strictEqual(forbiddenRes.status, 403);

  const forbiddenWdRes = await request(app)
    .get('/api/crypto/admin/withdrawals')
    .set('Cookie', trader1Cookie);
  assert.strictEqual(forbiddenWdRes.status, 403);
});
