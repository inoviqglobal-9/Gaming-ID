const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const path = require('path');
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
    username: `admin_sync_${timestamp}`,
    clientId: `admin_sync_${timestamp}`,
    passwordHash: passHash,
    role: 'ADMIN',
    status: 'ACTIVE',
  });

  traderUser = await User.create({
    username: `trader_sync_${timestamp}`,
    clientId: `trader_sync_${timestamp}`,
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
});

test('Scanner Config & Deposit Payment Synchronization Test Suite', async (t) => {
  const trc20Addr1 = 'TPF1ZetizM3m9nnu7xkh2EczsL2fZ6b8Nd';
  const trc20Addr2 = 'TQr8Vp6K9vW2Z4yL1m5N7q3J8xH2gB9dF1';

  await t.test('1. Scanner publication and activation lifecycle (Test Cases 1, 2, 3)', async () => {
    // A. Create DRAFT Scanner
    const scanner = await ScannerConfig.create({
      scannerId: 'QR-TEST-001',
      scannerName: 'USDT TRC20 Primary Vault',
      merchantName: 'RisePay Vault',
      merchantIdentifier: trc20Addr1,
      walletAddress: trc20Addr1,
      qrImageUrl: '/uploads/scanner-test-001.jpeg',
      paymentProvider: 'USDT TRC20',
      mode: 'LIVE',
      status: 'DRAFT',
      isPublished: false,
      isActive: false,
      uploadedBy: adminUser._id,
    });

    // Attempt to activate DRAFT scanner directly without publishing -> should be rejected
    const badActRes = await request(app)
      .post(`/api/scanner/admin/${scanner._id}/activate`)
      .set('Cookie', adminCookie);
    assert.equal(badActRes.status, 400);
    assert.match(badActRes.body.message, /must be published/i);

    // Publish Scanner
    const pubRes = await request(app)
      .post(`/api/scanner/admin/${scanner._id}/publish`)
      .set('Cookie', adminCookie);
    assert.equal(pubRes.status, 200);
    assert.equal(pubRes.body.scanner.status, 'PUBLISHED');
    assert.equal(pubRes.body.scanner.isPublished, true);
    assert.equal(pubRes.body.scanner.isActive, false);

    // Activate Published Scanner
    const actRes = await request(app)
      .post(`/api/scanner/admin/${scanner._id}/activate`)
      .set('Cookie', adminCookie);
    assert.equal(actRes.status, 200);
    assert.equal(actRes.body.scanner.status, 'ACTIVE');
    assert.equal(actRes.body.scanner.isActive, true);

    // Verify Active count
    const activeCount = await ScannerConfig.countDocuments({ isActive: true, status: 'ACTIVE' });
    assert.equal(activeCount, 1);
  });

  await t.test('2. Trader Deposit Request uses exact Active Scanner (Test Cases 4, 5, 6, 7, 8, 9)', async () => {
    // Seed Active Scanner
    const activeScanner = await ScannerConfig.create({
      scannerId: 'QR-TEST-ACTIVE',
      scannerName: 'RisePay Official USDT Vault',
      merchantName: 'RisePay Vault',
      merchantIdentifier: trc20Addr1,
      walletAddress: trc20Addr1,
      qrImageUrl: '/uploads/scanner-ca8978fd-ae2b-4a24-bd3b-165ab400deab.jpeg',
      paymentProvider: 'USDT TRC20',
      status: 'ACTIVE',
      isPublished: true,
      isActive: true,
      uploadedBy: adminUser._id,
    });

    // Check Trader Deposit Settings endpoint
    const setRes = await request(app)
      .get('/api/trader/deposit-settings')
      .set('Cookie', traderCookie);
    assert.equal(setRes.status, 200);
    assert.ok(setRes.body.data.activeScanner);
    assert.equal(setRes.body.data.activeScanner.walletAddress, trc20Addr1);
    assert.equal(setRes.body.data.activeScanner.qrImageUrl, activeScanner.qrImageUrl);

    // Trader creates Working Deposit
    const workRes = await request(app)
      .post('/api/trader/deposit-requests')
      .set('Cookie', traderCookie)
      .send({
        depositType: 'WORKING_DEPOSIT',
        amount: 250,
        currency: 'USDT',
      });
    assert.equal(workRes.status, 201);
    assert.equal(workRes.body.data.wallet, trc20Addr1);
    assert.equal(workRes.body.data.destinationWalletSnapshot.address, trc20Addr1);
    assert.equal(workRes.body.data.scannerId, 'QR-TEST-ACTIVE');
    assert.equal(workRes.body.data.qrImageUrl, activeScanner.qrImageUrl);
    assert.notEqual(workRes.body.data.wallet, 'TX7D7vH3qV8kYq4eR9P4dE8vL3kYq4eR9P');
  });

  await t.test('3. No Active Scanner safely blocks new deposit creation (Test Cases 10, 11, 12)', async () => {
    // Ensure all scanners are ARCHIVED or INACTIVE
    await ScannerConfig.create({
      scannerId: 'QR-INACTIVE',
      scannerName: 'Inactive Scanner',
      merchantName: 'RisePay',
      merchantIdentifier: trc20Addr1,
      walletAddress: trc20Addr1,
      qrImageUrl: '/uploads/test.png',
      paymentProvider: 'USDT TRC20',
      status: 'INACTIVE',
      isActive: false,
      isPublished: true,
    });

    await ScannerConfig.create({
      scannerId: 'QR-ARCHIVED',
      scannerName: 'Archived Scanner',
      merchantName: 'RisePay',
      merchantIdentifier: trc20Addr2,
      walletAddress: trc20Addr2,
      qrImageUrl: '/uploads/test2.png',
      paymentProvider: 'USDT TRC20',
      status: 'ARCHIVED',
      isActive: false,
      isPublished: false,
    });

    // Check Active Scanner endpoint returns unavailable
    const actRes = await request(app)
      .get('/api/scanner/active')
      .set('Cookie', traderCookie);
    assert.equal(actRes.status, 200);
    assert.equal(actRes.body.isAvailable, false);
    assert.equal(actRes.body.scanner, null);

    // Attempt to create new USDT deposit session -> should be rejected with 503
    const depRes = await request(app)
      .post('/api/trader/deposit-requests')
      .set('Cookie', traderCookie)
      .send({
        depositType: 'WORKING_DEPOSIT',
        amount: 100,
        currency: 'USDT',
      });
    assert.equal(depRes.status, 503);
    assert.equal(depRes.body.isDestinationUnavailable, true);
  });

  await t.test('4. Changing Active Scanner updates NEW requests while preserving EXISTING requests (Test Cases 13, 14, 15)', async () => {
    // Scanner 1 is active
    const sc1 = await ScannerConfig.create({
      scannerId: 'QR-1',
      scannerName: 'Scanner 1',
      merchantName: 'Vault 1',
      merchantIdentifier: trc20Addr1,
      walletAddress: trc20Addr1,
      qrImageUrl: '/uploads/qr1.png',
      paymentProvider: 'USDT TRC20',
      status: 'ACTIVE',
      isPublished: true,
      isActive: true,
      uploadedBy: adminUser._id,
    });

    // Trader creates Request 1 using Scanner 1
    const req1Res = await request(app)
      .post('/api/trader/deposit-requests')
      .set('Cookie', traderCookie)
      .send({
        depositType: 'WORKING_DEPOSIT',
        amount: 150,
        currency: 'USDT',
      });
    assert.equal(req1Res.status, 201);
    const req1Id = req1Res.body.data._id;
    assert.equal(req1Res.body.data.wallet, trc20Addr1);
    assert.equal(req1Res.body.data.scannerId, 'QR-1');

    // Submit evidence for Request 1 so it becomes SUBMITTED
    const subRes = await request(app)
      .post(`/api/trader/deposit-requests/${req1Id}/submit-evidence`)
      .set('Cookie', traderCookie)
      .send({
        txHash: '1111111111111111111111111111111111111111111111111111111111111111',
      });
    assert.equal(subRes.status, 200);

    // Admin creates and activates Scanner 2
    const sc2 = await ScannerConfig.create({
      scannerId: 'QR-2',
      scannerName: 'Scanner 2',
      merchantName: 'Vault 2',
      merchantIdentifier: trc20Addr2,
      walletAddress: trc20Addr2,
      qrImageUrl: '/uploads/qr2.png',
      paymentProvider: 'USDT TRC20',
      status: 'PUBLISHED',
      isPublished: true,
      isActive: false,
      uploadedBy: adminUser._id,
    });

    const switchRes = await request(app)
      .post(`/api/scanner/admin/${sc2._id}/activate`)
      .set('Cookie', adminCookie);
    assert.equal(switchRes.status, 200);

    // Verify Scanner 1 was deactivated
    const refreshedSc1 = await ScannerConfig.findById(sc1._id);
    assert.equal(refreshedSc1.isActive, false);

    // Request 1 MUST retain original Scanner 1 and trc20Addr1
    const checkReq1 = await request(app)
      .get(`/api/trader/deposit-requests/${req1Id}/payment-details`)
      .set('Cookie', traderCookie);
    assert.equal(checkReq1.status, 200);
    assert.equal(checkReq1.body.data.wallet, trc20Addr1);
    assert.equal(checkReq1.body.data.scannerId, 'QR-1');

    // Trader creates Request 2 -> MUST use newly active Scanner 2 and trc20Addr2
    const req2Res = await request(app)
      .post('/api/trader/deposit-requests')
      .set('Cookie', traderCookie)
      .send({
        depositType: 'SECURITY_DEPOSIT',
        amount: 300,
        currency: 'USDT',
      });
    assert.equal(req2Res.status, 201);
    assert.equal(req2Res.body.data.wallet, trc20Addr2);
    assert.equal(req2Res.body.data.scannerId, 'QR-2');
  });

  await t.test('5. Normal Working Deposit vs Security Deposit Accounting & Crypto Isolation (Test Cases 18, 19, 20, 21, 22, 25)', async () => {
    // Active scanner
    await ScannerConfig.create({
      scannerId: 'QR-VAULT',
      scannerName: 'Official Vault',
      merchantName: 'Vault',
      merchantIdentifier: trc20Addr1,
      walletAddress: trc20Addr1,
      qrImageUrl: '/uploads/vault.png',
      paymentProvider: 'USDT TRC20',
      status: 'ACTIVE',
      isPublished: true,
      isActive: true,
    });

    // Step A: Create and approve Normal Working Deposit (500 USDT)
    const workDep = await DepositRequest.create({
      requestId: `DEP-WORK-${Date.now()}`,
      userId: traderUser._id,
      clientId: traderUser.username,
      depositType: 'WORKING_DEPOSIT',
      systemType: 'NORMAL',
      amount: 500,
      currency: 'USDT',
      wallet: trc20Addr1,
      status: 'SUBMITTED',
      txHash: '0xwork1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    });

    const approveWorkRes = await request(app)
      .patch(`/api/deposit/admin/${workDep._id}/review`)
      .set('Cookie', adminCookie)
      .send({
        action: 'APPROVE',
        decisionNotes: 'Approved 500 USDT working deposit',
      });
    assert.equal(approveWorkRes.status, 200);

    // Step B: Create and approve Normal Security Deposit (200 USDT)
    const secDep = await DepositRequest.create({
      requestId: `DEP-SEC-${Date.now()}`,
      userId: traderUser._id,
      clientId: traderUser.username,
      depositType: 'SECURITY_DEPOSIT',
      systemType: 'NORMAL',
      amount: 200,
      currency: 'USDT',
      wallet: trc20Addr1,
      status: 'SUBMITTED',
      txHash: '0xsec1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    });

    const approveSecRes = await request(app)
      .patch(`/api/deposit/admin/${secDep._id}/review`)
      .set('Cookie', adminCookie)
      .send({
        action: 'APPROVE',
        decisionNotes: 'Approved 200 USDT security deposit',
      });
    assert.equal(approveSecRes.status, 200);

    // Step C: Verify UPI Dashboard balances
    const summaryRes = await request(app)
      .get('/api/trader/dashboard/summary')
      .set('Cookie', traderCookie);
    assert.equal(summaryRes.status, 200);
    // Spendable available balance MUST be 500 (Working Deposit only)
    assert.equal(summaryRes.body.data.balance.usdt, 500.0);
    // Security Deposit balance MUST be 200
    assert.equal(summaryRes.body.data.balance.securityDeposit, 200.0);

    // Step D: Verify Crypto Dashboard is completely clean of normal deposits
    const cryptoDeposits = await CryptoDepositRequest.find({ traderId: traderUser._id });
    assert.equal(cryptoDeposits.length, 0);

    const cryptoWalletRes = await request(app)
      .get('/api/trader/wallet/usdt?module=CRYPTO')
      .set('Cookie', traderCookie);
    assert.equal(cryptoWalletRes.status, 200);
    assert.equal(parseFloat(cryptoWalletRes.body.availableBalance), 0.0);
    assert.equal(parseFloat(cryptoWalletRes.body.securityDepositBalance), 0.0);

    // Step E: Duplicate approval test -> double clicking approve does not credit twice
    const dupApproveRes = await request(app)
      .patch(`/api/deposit/admin/${workDep._id}/review`)
      .set('Cookie', adminCookie)
      .send({
        action: 'APPROVE',
        decisionNotes: 'Second approve attempt',
      });
    // Already approved or duplicate prevented
    assert.ok(dupApproveRes.status === 400 || dupApproveRes.status === 500);

    // Ledger must have exactly 1 working deposit and 1 security deposit
    const ledgerEntries = await BalanceLedger.find({ userId: traderUser._id });
    const workEntries = ledgerEntries.filter((e) => e.entryType === 'DEPOSIT_CONFIRMED');
    const secEntries = ledgerEntries.filter((e) => e.entryType === 'SECURITY_DEPOSIT_CONFIRMED');
    assert.equal(workEntries.length, 1);
    assert.equal(secEntries.length, 1);
  });
});
