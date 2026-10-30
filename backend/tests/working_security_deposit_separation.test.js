const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../app');
const { setupTestDB, cleanupTestDB } = require('./setup');
const User = require('../models/User');
const DepositRequest = require('../models/DepositRequest');
const BalanceLedger = require('../models/BalanceLedger');
const UsdtWallet = require('../models/UsdtWallet');
const DepositConfig = require('../models/DepositConfig');
const { config } = require('../config/env');

test.before(async () => {
  await setupTestDB();
});

test.after(async () => {
  await cleanupTestDB();
});

test('Working Deposit and Security Deposit Separation Suite', async (t) => {
  const timestamp = Date.now();
  const testUsername = `sec_trader_${timestamp}`;

  // 1. Create a fresh test trader and admin
  const trader = await User.create({
    username: testUsername,
    clientId: testUsername,
    passwordHash: 'hashed_password_123',
    role: 'TRADER',
  });

  const admin = await User.create({
    username: `sec_admin_${timestamp}`,
    clientId: `sec_admin_${timestamp}`,
    passwordHash: 'hashed_password_123',
    role: 'ADMIN',
  });

  t.after(async () => {
    await DepositRequest.deleteMany({ userId: { $in: [trader._id, admin._id] } });
    await BalanceLedger.deleteMany({ userId: { $in: [trader._id, admin._id] } });
    await UsdtWallet.deleteMany({ traderId: { $in: [trader._id, admin._id] } });
    await User.deleteMany({ _id: { $in: [trader._id, admin._id] } });
  });

  await t.test('1. Initial state: Trader has 0 available and 0 security deposit balance', async () => {
    const wallet = await UsdtWallet.syncWithLedger(trader._id);
    const normalVal = await wallet.toSubledgerValuation('NORMAL');

    assert.equal(parseFloat(normalVal.availableBalance), 0.0);
    assert.equal(parseFloat(normalVal.securityDepositBalance), 0.0);
    assert.equal(parseFloat(normalVal.inrEquivalent), 0.0);
  });

  await t.test('2. Working Deposit: Admin approval credits exact USDT to spendable available balance', async () => {
    const workingReq = await DepositRequest.create({
      requestId: `DEP-WORK-${timestamp}-1`,
      userId: trader._id,
      clientId: trader.username,
      depositType: 'WORKING_DEPOSIT',
      systemType: 'NORMAL',
      amount: 1000.0,
      currency: 'USDT',
      status: 'AWAITING_PAYMENT',
      wallet: 'TQr8Vp6K9vW2Z4yL1m5N7q3J8xH2gB9dF1',
      txHash: `tx_work_${timestamp}_1`,
    });

    // Record ledger entry as depositController.js does for working deposit
    await BalanceLedger.recordVerifiedEntry({
      userId: trader._id,
      clientId: trader.username,
      currency: 'USDT',
      entryType: 'DEPOSIT_CONFIRMED',
      systemType: 'NORMAL',
      amount: 1000.0,
      referenceRequestId: workingReq.requestId,
      notes: 'Working deposit verified',
      performedBy: admin._id,
    });

    workingReq.status = 'APPROVED';
    workingReq.approvedAt = new Date();
    await workingReq.save();

    const wallet = await UsdtWallet.syncWithLedger(trader._id);
    const normalVal = await wallet.toSubledgerValuation('NORMAL');

    assert.equal(parseFloat(normalVal.availableBalance), 1000.0);
    assert.equal(parseFloat(normalVal.securityDepositBalance), 0.0);
    assert.equal(parseFloat(normalVal.inrEquivalent), 105000.0); // 1000 * 105
  });

  await t.test('3. Security Deposit: Admin approval records to separate security balance without inflating available balance', async () => {
    const securityReq = await DepositRequest.create({
      requestId: `DEP-SEC-${timestamp}-1`,
      userId: trader._id,
      clientId: trader.username,
      depositType: 'SECURITY_DEPOSIT',
      systemType: 'NORMAL',
      amount: 500.0,
      currency: 'USDT',
      status: 'AWAITING_PAYMENT',
      wallet: 'TQr8Vp6K9vW2Z4yL1m5N7q3J8xH2gB9dF1',
      txHash: `tx_sec_${timestamp}_1`,
    });

    // Record ledger entry as depositController.js does for security deposit
    await BalanceLedger.recordVerifiedEntry({
      userId: trader._id,
      clientId: trader.username,
      currency: 'USDT',
      entryType: 'SECURITY_DEPOSIT_CONFIRMED',
      systemType: 'NORMAL',
      amount: 500.0,
      referenceRequestId: securityReq.requestId,
      notes: 'Security deposit verified',
      performedBy: admin._id,
    });

    securityReq.status = 'APPROVED';
    securityReq.approvedAt = new Date();
    await securityReq.save();

    const wallet = await UsdtWallet.syncWithLedger(trader._id);
    const normalVal = await wallet.toSubledgerValuation('NORMAL');

    // Available balance MUST remain 1000.00 (not 1500.00!)
    assert.equal(parseFloat(normalVal.availableBalance), 1000.0);
    // Security deposit balance MUST be 500.00
    assert.equal(parseFloat(normalVal.securityDepositBalance), 500.0);
    // INR equivalent MUST remain based on available balance (1000 * 105 = 105000)
    assert.equal(parseFloat(normalVal.inrEquivalent), 105000.0);
  });

  await t.test('4. Crypto Dashboard isolation: Neither Working nor Security deposit touches Crypto subledger', async () => {
    const wallet = await UsdtWallet.syncWithLedger(trader._id);
    const cryptoVal = await wallet.toSubledgerValuation('CRYPTO');

    // Crypto subledger has 0 balance
    assert.equal(parseFloat(cryptoVal.availableBalance), 0.0);
    assert.equal(parseFloat(cryptoVal.lockedBalance), 0.0);
    assert.equal(parseFloat(cryptoVal.totalBalance), 0.0);
  });

  await t.test('5. Additional deposits: Working and Security deposits accumulate into their respective ledgers', async () => {
    // Second Working Deposit of 250 USDT
    await BalanceLedger.recordVerifiedEntry({
      userId: trader._id,
      clientId: trader.username,
      currency: 'USDT',
      entryType: 'DEPOSIT_CONFIRMED',
      systemType: 'NORMAL',
      amount: 250.0,
      referenceRequestId: `DEP-WORK-${timestamp}-2`,
      notes: 'Second working deposit',
      performedBy: admin._id,
    });

    // Second Security Deposit of 300 USDT
    await BalanceLedger.recordVerifiedEntry({
      userId: trader._id,
      clientId: trader.username,
      currency: 'USDT',
      entryType: 'SECURITY_DEPOSIT_CONFIRMED',
      systemType: 'NORMAL',
      amount: 300.0,
      referenceRequestId: `DEP-SEC-${timestamp}-2`,
      notes: 'Second security deposit',
      performedBy: admin._id,
    });

    const wallet = await UsdtWallet.syncWithLedger(trader._id);
    const normalVal = await wallet.toSubledgerValuation('NORMAL');

    // Total Available: 1000 + 250 = 1250 USDT
    assert.equal(parseFloat(normalVal.availableBalance), 1250.0);
    // Total Security Deposit: 500 + 300 = 800 USDT
    assert.equal(parseFloat(normalVal.securityDepositBalance), 800.0);
    // INR Equivalent: 1250 * 105 = 131,250
    assert.equal(parseFloat(normalVal.inrEquivalent), 131250.0);
  });

  await t.test('6. Persistence on refresh: syncWithLedger maintains exact values without divergence', async () => {
    const refreshedWallet = await UsdtWallet.syncWithLedger(trader._id);
    const normalVal = await refreshedWallet.toSubledgerValuation('NORMAL');

    assert.equal(parseFloat(normalVal.availableBalance), 1250.0);
    assert.equal(parseFloat(normalVal.securityDepositBalance), 800.0);
  });

  await t.test('7. Duplicate protection: Recording same security deposit reference is rejected', async () => {
    await assert.rejects(
      async () => {
        await BalanceLedger.recordVerifiedEntry({
          userId: trader._id,
          clientId: trader.username,
          currency: 'USDT',
          entryType: 'SECURITY_DEPOSIT_CONFIRMED',
          systemType: 'NORMAL',
          amount: 500.0,
          referenceRequestId: `DEP-SEC-${timestamp}-1`, // Already exists
          notes: 'Attempted duplicate',
          performedBy: admin._id,
        });
      },
      /Duplicate entry prevented/
    );
  });

  await t.test('8. End-to-End API: Admin approval of Working Deposit vs Security Deposit via HTTP endpoint', async () => {
    // Hash password properly for supertest auth
    const passHash = await User.hashPassword('Password@123456');
    const apiTrader = await User.create({
      username: `api_trader_${timestamp}`,
      clientId: `api_trader_${timestamp}`,
      passwordHash: passHash,
      role: 'TRADER',
      status: 'ACTIVE',
    });

    const apiAdmin = await User.create({
      username: `api_admin_${timestamp}`,
      clientId: `api_admin_${timestamp}`,
      passwordHash: passHash,
      role: 'ADMIN',
      status: 'ACTIVE',
    });

    // Login Admin
    const adminLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: `api_admin_${timestamp}`, password: 'Password@123456' });
    const adminCookie = adminLoginRes.headers['set-cookie'] ? adminLoginRes.headers['set-cookie'][0] : '';

    // Login Trader
    const traderLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: `api_trader_${timestamp}`, password: 'Password@123456' });
    const traderCookie = traderLoginRes.headers['set-cookie'] ? traderLoginRes.headers['set-cookie'][0] : '';

    // Step A: Create Working Deposit Request (100 USDT)
    const workReq = await DepositRequest.create({
      requestId: `DEP-API-WORK-${timestamp}`,
      userId: apiTrader._id,
      clientId: apiTrader.username,
      depositType: 'WORKING_DEPOSIT',
      systemType: 'NORMAL',
      amount: 100.0,
      currency: 'USDT',
      status: 'AWAITING_PAYMENT',
      wallet: 'TQr8Vp6K9vW2Z4yL1m5N7q3J8xH2gB9dF1',
      txHash: `tx_api_work_${timestamp}`,
    });

    // Step B: Admin approves Working Deposit via API
    const approveWorkRes = await request(app)
      .patch(`/api/deposit/admin/${workReq._id}/review`)
      .set('Cookie', adminCookie)
      .send({
        action: 'APPROVE',
        decisionNotes: 'Admin approved working deposit test',
        verificationStatus: 'VERIFIED',
      });

    assert.equal(approveWorkRes.status, 200);
    assert.equal(approveWorkRes.body.success, true);

    // Step C: Verify Trader's wallet after Working Deposit approval
    const traderSumRes1 = await request(app)
      .get('/api/trader/dashboard/summary')
      .set('Cookie', traderCookie);

    assert.equal(traderSumRes1.status, 200);
    assert.equal(traderSumRes1.body.data.balance.usdt, 100.0);
    assert.equal(traderSumRes1.body.data.balance.securityDeposit, 0.0);

    // Step D: Create Security Deposit Request (200 USDT)
    const secReq = await DepositRequest.create({
      requestId: `DEP-API-SEC-${timestamp}`,
      userId: apiTrader._id,
      clientId: apiTrader.username,
      depositType: 'SECURITY_DEPOSIT',
      systemType: 'NORMAL',
      amount: 200.0,
      currency: 'USDT',
      status: 'AWAITING_PAYMENT',
      wallet: 'TQr8Vp6K9vW2Z4yL1m5N7q3J8xH2gB9dF1',
      txHash: `tx_api_sec_${timestamp}`,
    });

    // Step E: Admin approves Security Deposit via API
    const approveSecRes = await request(app)
      .patch(`/api/deposit/admin/${secReq._id}/review`)
      .set('Cookie', adminCookie)
      .send({
        action: 'APPROVE',
        decisionNotes: 'Admin approved security deposit test',
        verificationStatus: 'VERIFIED',
      });

    assert.equal(approveSecRes.status, 200);
    assert.equal(approveSecRes.body.success, true);
    assert.match(approveSecRes.body.message, /Security deposit approved/);

    // Step F: Verify Trader's wallet after Security Deposit approval
    // Available USDT balance MUST stay 100.0 (NOT 300.0)
    // Security Deposit balance MUST be 200.0
    const traderSumRes2 = await request(app)
      .get('/api/trader/dashboard/summary')
      .set('Cookie', traderCookie);

    assert.equal(traderSumRes2.status, 200);
    assert.equal(traderSumRes2.body.data.balance.usdt, 100.0);
    assert.equal(traderSumRes2.body.data.balance.securityDeposit, 200.0);

    // Step G: Query Trader USDT Wallet endpoint with module=NORMAL
    const normalWalletRes = await request(app)
      .get('/api/trader/wallet/usdt?module=NORMAL')
      .set('Cookie', traderCookie);

    assert.equal(normalWalletRes.status, 200);
    assert.equal(normalWalletRes.body.availableBalance, '100.000000');
    assert.equal(normalWalletRes.body.securityDepositBalance, '200.000000');
    assert.equal(normalWalletRes.body.inrEquivalent, '10500.00'); // 100 * 105

    // Step H: Query Crypto Wallet endpoint to verify total crypto isolation
    const cryptoWalletRes = await request(app)
      .get('/api/trader/wallet/usdt?module=CRYPTO')
      .set('Cookie', traderCookie);

    assert.equal(cryptoWalletRes.status, 200);
    assert.equal(cryptoWalletRes.body.availableBalance, '0.000000');
    assert.equal(cryptoWalletRes.body.securityDepositBalance, '0.000000');
    assert.equal(cryptoWalletRes.body.inrEquivalent, '0.00');
  });
});
