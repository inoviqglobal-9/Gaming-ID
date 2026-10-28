const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mongoServer;
let app;
let User;
let BalanceLedger;
let WalletCheck;
let WalletCheckSettings;

let adminUser;
let adminToken;
let trader1;
let trader1Token;
let trader2;
let trader2Token;

// Sample valid TRC-20 address generated with valid Base58Check checksum
const VALID_TRON_ADDRESS_1 = 'TVfGVQgy2tDKWYoP74jsR8aWg7QHyFqQHF';
const VALID_TRON_ADDRESS_2 = 'TLyqzVGLV1srkB7dToTApsgCAoxUHH6645';

describe('Wallet Check & AML Screening Management System', () => {
  before(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    app = require('../app');
    User = require('../models/User');
    BalanceLedger = require('../models/BalanceLedger');
    WalletCheck = require('../models/WalletCheck');
    WalletCheckSettings = require('../models/WalletCheckSettings');

    // Create Admin
    const adminHash = await User.hashPassword('AdminPass#123');
    adminUser = await User.create({
      username: 'admin_wallet_checker',
      email: 'admin_wallet@test.com',
      fullName: 'Admin Wallet Checker',
      passwordHash: adminHash,
      role: 'ADMIN',
      status: 'ACTIVE',
    });

    // Create Trader 1
    const trader1Hash = await User.hashPassword('Trader1Pass#123');
    trader1 = await User.create({
      username: 'trader_one_test',
      fullName: 'Trader One AML',
      passwordHash: trader1Hash,
      role: 'TRADER',
      status: 'ACTIVE',
    });

    // Create Trader 2
    const trader2Hash = await User.hashPassword('Trader2Pass#123');
    trader2 = await User.create({
      username: 'trader_two_test',
      fullName: 'Trader Two AML',
      passwordHash: trader2Hash,
      role: 'TRADER',
      status: 'ACTIVE',
    });

    // Fund Trader 1 with 20.00 USDT
    await BalanceLedger.recordVerifiedEntry({
      userId: trader1._id,
      clientId: trader1.username,
      currency: 'USDT',
      entryType: 'CRYPTO_DEPOSIT_CONFIRMED',
      amount: 20.0,
      referenceRequestId: 'TEST-USDT-FUND-01',
      notes: 'Initial test deposit',
      performedBy: trader1._id,
    });

    // Trader 2 has 0.00 USDT balance

    // Log in Admin
    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin_wallet_checker', password: 'AdminPass#123' });
    adminToken = adminLogin.body.token;

    // Log in Trader 1
    const t1Login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'trader_one_test', password: 'Trader1Pass#123' });
    trader1Token = t1Login.body.token;

    // Log in Trader 2
    const t2Login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'trader_two_test', password: 'Trader2Pass#123' });
    trader2Token = t2Login.body.token;
  });

  after(async () => {
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  });

  test('Trader GET /api/trader/wallet-check/settings returns default 3.00 USDT fee and balance', async () => {
    const res = await request(app)
      .get('/api/trader/wallet-check/settings')
      .set('Authorization', `Bearer ${trader1Token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.enabled, true);
    assert.equal(res.body.data.feeAmount, 3.0);
    assert.equal(res.body.data.feeCurrency, 'USDT');
    assert.equal(res.body.data.availableUsdtBalance, 20.0);
    assert.equal(res.body.data.canAffordCheck, true);
    assert.ok(res.body.data.supportedNetworks.includes('TRC-20'));
  });

  test('Trader POST /api/trader/wallet-check rejects empty or invalid Tron address format', async () => {
    // Empty address
    const res1 = await request(app)
      .post('/api/trader/wallet-check')
      .set('Authorization', `Bearer ${trader1Token}`)
      .send({ walletAddress: '', network: 'TRC-20' });

    assert.equal(res1.status, 400);
    assert.equal(res1.body.success, false);

    // Invalid prefix
    const res2 = await request(app)
      .post('/api/trader/wallet-check')
      .set('Authorization', `Bearer ${trader1Token}`)
      .send({
        walletAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        network: 'TRC-20',
      });

    assert.equal(res2.status, 400);
    assert.equal(res2.body.success, false);
    assert.match(res2.body.message, /TRC-20 address must begin with the letter "T"/);

    // Typo checksum failure
    const res3 = await request(app)
      .post('/api/trader/wallet-check')
      .set('Authorization', `Bearer ${trader1Token}`)
      .send({
        walletAddress: 'TX7D7vH3qV8kYq4eR9P4dE8vL3kYq4eR9P',
        network: 'TRC-20',
      });

    assert.equal(res3.status, 400);
    assert.equal(res3.body.success, false);
    assert.match(res3.body.message, /checksum validation failed/);
  });

  test('Trader POST /api/trader/wallet-check rejects unsupported network', async () => {
    const res = await request(app)
      .post('/api/trader/wallet-check')
      .set('Authorization', `Bearer ${trader1Token}`)
      .send({
        walletAddress: VALID_TRON_ADDRESS_1,
        network: 'SOLANA_UNSUPPORTED',
      });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /not supported/);
  });

  test('Trader with insufficient USDT balance is rejected and NO fee is deducted', async () => {
    // Trader 2 has 0.00 USDT balance
    const res = await request(app)
      .post('/api/trader/wallet-check')
      .set('Authorization', `Bearer ${trader2Token}`)
      .send({
        walletAddress: VALID_TRON_ADDRESS_1,
        network: 'TRC-20',
      });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.code, 'INSUFFICIENT_BALANCE');
    assert.match(res.body.message, /Insufficient balance/);

    // Verify 0 balance remains untouched
    const t2Bal = await BalanceLedger.calculateAvailableBalance(trader2._id, 'USDT');
    assert.equal(t2Bal, 0);
  });

  test('Trader with sufficient balance performs check, fee is atomically charged (20.00 -> 17.00 USDT)', async () => {
    const initialBal = await BalanceLedger.calculateAvailableBalance(trader1._id, 'USDT');
    assert.equal(initialBal, 20.0);

    const res = await request(app)
      .post('/api/trader/wallet-check')
      .set('Authorization', `Bearer ${trader1Token}`)
      .send({
        walletAddress: VALID_TRON_ADDRESS_1,
        network: 'TRC-20',
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.checkId);
    assert.equal(res.body.data.status, 'COMPLETED');
    assert.equal(res.body.data.feeStatus, 'CHARGED');
    assert.equal(res.body.data.feeAmount, 3.0);
    assert.ok(typeof res.body.data.riskScore === 'number');
    assert.ok(res.body.data.riskCategory);

    // Verify balance is now 17.00 USDT
    const updatedBal = await BalanceLedger.calculateAvailableBalance(trader1._id, 'USDT');
    assert.equal(updatedBal, 17.0);

    // Verify ledger entry
    const ledgerEntry = await BalanceLedger.findOne({
      referenceRequestId: res.body.data.checkId,
      entryType: 'WALLET_CHECK_FEE',
    });
    assert.ok(ledgerEntry);
    assert.equal(ledgerEntry.amount, -3.0);
    assert.equal(ledgerEntry.balanceAfter, 17.0);
  });

  test('Trader GET /api/trader/wallet-check/history and /:id/report returns completed record and report', async () => {
    const historyRes = await request(app)
      .get('/api/trader/wallet-check/history')
      .set('Authorization', `Bearer ${trader1Token}`);

    assert.equal(historyRes.status, 200);
    assert.equal(historyRes.body.success, true);
    assert.ok(historyRes.body.data.length >= 1);

    const check = historyRes.body.data[0];
    assert.ok(check.checkId);
    assert.ok(check.maskedAddress);

    // Report endpoint
    const reportRes = await request(app)
      .get(`/api/trader/wallet-check/${check.checkId}/report`)
      .set('Authorization', `Bearer ${trader1Token}`);

    assert.equal(reportRes.status, 200);
    assert.equal(reportRes.body.success, true);
    assert.equal(reportRes.body.data.checkId, check.checkId);
    assert.ok(reportRes.body.data.riskIndicators.length > 0);
    assert.match(reportRes.body.data.disclaimer, /Notice: This screening report reflects/);
  });

  test('IDOR Protection: Another trader cannot access check report', async () => {
    const checks = await WalletCheck.find({ userId: trader1._id });
    const check1 = checks[0];

    const idorRes = await request(app)
      .get(`/api/trader/wallet-check/${check1.checkId}/report`)
      .set('Authorization', `Bearer ${trader2Token}`);

    assert.equal(idorRes.status, 404);
  });

  test('Admin: Can view all checks, update settings to 5.00 USDT, and disable Wallet Check', async () => {
    // Admin list
    const adminList = await request(app)
      .get('/api/admin/wallet-check')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(adminList.status, 200);
    assert.ok(adminList.body.data.length >= 1);

    // Admin update settings
    const updateRes = await request(app)
      .patch('/api/admin/wallet-check/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        feeAmount: 5.0,
        enabled: false,
      });

    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.data.feeAmount, 5.0);
    assert.equal(updateRes.body.data.enabled, false);

    // Trader now sees disabled service
    const disabledAttempt = await request(app)
      .post('/api/trader/wallet-check')
      .set('Authorization', `Bearer ${trader1Token}`)
      .send({
        walletAddress: VALID_TRON_ADDRESS_2,
        network: 'TRC-20',
      });

    assert.equal(disabledAttempt.status, 400);
    assert.match(disabledAttempt.body.message, /currently disabled by administrator/);

    // Re-enable for subsequent testing
    await request(app)
      .patch('/api/admin/wallet-check/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        feeAmount: 3.0,
        enabled: true,
      });
  });
});
