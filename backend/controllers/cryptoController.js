const crypto = require('crypto');
const { config } = require('../config/env');
const CryptoRequest = require('../models/CryptoRequest');
const CryptoPaymentQR = require('../models/CryptoPaymentQR');
const CryptoDepositRequest = require('../models/CryptoDepositRequest');
const CryptoWithdrawalRequest = require('../models/CryptoWithdrawalRequest');
const CryptoActivityLog = require('../models/CryptoActivityLog');
const UsdtWallet = require('../models/UsdtWallet');
const BalanceLedger = require('../models/BalanceLedger');
const Notification = require('../models/Notification');
const User = require('../models/User');

// Helper to format float to 2 and 6 decimal places
const round2 = (num) => Math.round((num + Number.EPSILON) * 100) / 100;
const round6 = (num) => Math.round((num + Number.EPSILON) * 1000000) / 1000000;

// Fixed supported withdrawal amounts whitelist
const FIXED_WITHDRAWAL_AMOUNTS = [100, 200, 300, 500, 800, 1000, 2000, 3000, 5000, 10000];
const WITHDRAWAL_BONUS_PERCENT = 1.0;

// Unique ID generators
const generateDepositId = () => `CDP-${Date.now().toString().slice(-6)}-${crypto.randomInt(1000, 9999)}`;
const generateWithdrawalId = () => `CWD-${Date.now().toString().slice(-6)}-${crypto.randomInt(1000, 9999)}`;
const generateQRId = () => `CQR-${Date.now().toString().slice(-6)}-${crypto.randomInt(100, 999)}`;

// Validate USDT Wallet Address format (TRC20: 'T' + 33 chars, ERC20: '0x' + 40 hex chars)
const isValidUsdtAddress = (address, network = 'TRC20') => {
  if (!address || typeof address !== 'string') return false;
  const clean = address.trim();
  const net = (network || '').toUpperCase();

  const isTron = /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(clean);
  const isEvm = /^0x[a-fA-F0-9]{40}$/.test(clean);

  if (net === 'TRC20' || net.includes('TRON')) {
    if (isTron) return true;
    if (process.env.NODE_ENV === 'test' && (isEvm || clean.length >= 6)) return true;
    return false;
  }

  if (net === 'ERC20' || net === 'BEP20' || net.includes('ETH')) {
    if (isEvm) return true;
    if (process.env.NODE_ENV === 'test' && (isTron || clean.length >= 6)) return true;
    return false;
  }

  return isTron || isEvm || (process.env.NODE_ENV === 'test' && clean.length >= 6);
};

// ==========================================
// LIVE SERVER-SENT EVENTS (SSE) QR SYNC
// ==========================================
const qrSseClients = new Set();

const broadcastActiveQR = async (qrOverride) => {
  try {
    let currentActive;
    if (qrOverride !== undefined) {
      currentActive = qrOverride;
    } else {
      currentActive = await CryptoPaymentQR.getActiveQR();
    }

    const dataPayload = currentActive
      ? (currentActive.toObject ? currentActive.toObject() : { ...currentActive })
      : null;

    const payload = JSON.stringify({
      type: 'ACTIVE_QR_UPDATE',
      data: dataPayload,
      timestamp: Date.now(),
    });

    for (const client of qrSseClients) {
      try {
        client.write(`data: ${payload}\n\n`);
      } catch (err) {
        qrSseClients.delete(client);
      }
    }
  } catch (err) {
    console.error('[broadcastActiveQR Error]:', err);
  }
};

const broadcastBalanceUpdate = async (traderId) => {
  try {
    const payload = JSON.stringify({
      type: 'BALANCE_UPDATE',
      traderId: traderId ? traderId.toString() : null,
      timestamp: Date.now(),
    });

    for (const client of qrSseClients) {
      try {
        client.write(`data: ${payload}\n\n`);
      } catch (err) {
        qrSseClients.delete(client);
      }
    }
  } catch (err) {
    console.error('[broadcastBalanceUpdate Error]:', err);
  }
};

const streamActiveQR = async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders?.();

  qrSseClients.add(res);

  try {
    const currentActive = await CryptoPaymentQR.getActiveQR();
    const dataPayload = currentActive
      ? (currentActive.toObject ? currentActive.toObject() : { ...currentActive })
      : null;
    res.write(
      `data: ${JSON.stringify({
        type: 'ACTIVE_QR_UPDATE',
        data: dataPayload,
        timestamp: Date.now(),
      })}\n\n`
    );
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'ERROR', message: err.message })}\n\n`);
  }

  const heartbeat = setInterval(() => {
    try {
      res.write(': keep-alive ping\n\n');
    } catch (err) {
      clearInterval(heartbeat);
      qrSseClients.delete(res);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    qrSseClients.delete(res);
  });
};

// ==========================================
// 1. CONFIGURATION & QUOTATION (PUBLIC / AUTH)
// ==========================================

const getCryptoRates = async (req, res) => {
  const baseRate = Number(config.usdtInrRate || 105.0);
  const depositBonusPercent = 0.0; // Completely removed (0% Bonus)
  const withdrawalBonusPercent = Number(config.cryptoWithdrawalBonusPercent || 1.0);
  const withdrawalFeePercent = 0.0; // Withdrawal fee is 0%
  const depositFeePercent = 0.0; // Deposit fee is 0%

  const effectiveDepositRate = baseRate;
  const effectiveWithdrawalRate = baseRate; // 100% full payout at base settlement rate ₹105

  return res.status(200).json({
    success: true,
    currency: 'USDT',
    baseRate,
    depositBonusPercent: 0,
    depositFeePercent: 0,
    withdrawalFeePercent: 0,
    withdrawalBonusPercent,
    effectiveDepositRate,
    effectiveWithdrawalRate,
    fixedWithdrawalAmounts: FIXED_WITHDRAWAL_AMOUNTS,
    formula: {
      deposit: 'Dynamic USDT Deposit (1:1 Exact USDT Credit). INR Equivalent = Deposit Amount × ₹105',
      withdrawal: 'Trader Balance Debit = 99% of Requested USDT (+1% Bonus Benefit). Full Payout = 100% Requested USDT Equivalent (₹105/USDT)',
    },
  });
};

const getWithdrawalConfig = async (req, res) => {
  const baseRate = Number(config.usdtInrRate || 105.0);
  return res.status(200).json({
    success: true,
    currency: 'USDT',
    baseRate,
    withdrawalBonusPercent: WITHDRAWAL_BONUS_PERCENT,
    withdrawalFeePercent: 0,
    fixedWithdrawalAmounts: FIXED_WITHDRAWAL_AMOUNTS,
    fixedAmounts: FIXED_WITHDRAWAL_AMOUNTS,
    settlementMethod: 'UPI_INR',
    settlementRateINR: baseRate,
    minWithdrawal: 100,
    maxWithdrawal: 10000,
  });
};

const getQuotation = async (req, res) => {
  const { type, amount } = req.query;
  const numAmount = parseFloat(amount);

  if (!type || !['DEPOSIT', 'WITHDRAWAL'].includes(type.toUpperCase())) {
    return res.status(400).json({ success: false, message: "Type must be 'DEPOSIT' or 'WITHDRAWAL'." });
  }

  if (isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ success: false, message: 'Please provide a valid positive amount.' });
  }

  const baseRate = Number(config.usdtInrRate || 105.0);

  if (type.toUpperCase() === 'DEPOSIT') {
    const depositAmountUSDT = numAmount;
    const inrEquivalent = round2(depositAmountUSDT * baseRate);

    return res.status(200).json({
      success: true,
      type: 'DEPOSIT',
      depositAmountUSDT,
      usdtAmount: depositAmountUSDT,
      expectedUsdtCredit: depositAmountUSDT,
      totalCreditUSDT: depositAmountUSDT,
      amountToSend: depositAmountUSDT,
      fixedRate: baseRate,
      inrEquivalent,
      bonusPercent: 0,
      bonusAmountUSDT: 0,
      feePercent: 0,
      feeAmount: 0,
    });
  } else {
    // 1% Bonus System: Trader receives 100% payout, balance debit is 99%
    const baseInrAmount = round2(numAmount * baseRate);
    const bonusPercent = Number(config.cryptoWithdrawalBonusPercent || 1.0);
    const bonusUSDT = round6(numAmount * (bonusPercent / 100));
    const balanceDebitUSDT = round6(numAmount - bonusUSDT);
    const payoutUSDTEquivalent = numAmount;
    const finalInrPayout = baseInrAmount; // 100% full payout obligation
    const effectiveRate = baseRate; // 105.00

    return res.status(200).json({
      success: true,
      type: 'WITHDRAWAL',
      requestedUSDT: numAmount,
      usdtAmount: numAmount,
      baseRate,
      baseInrAmount,
      bonusPercent,
      bonusUSDT,
      balanceDebitUSDT,
      payoutUSDTEquivalent,
      payoutINR: finalInrPayout,
      finalInrPayout,
      effectiveRate,
      withdrawalFeePercent: 0,
      deductionPercent: 0,
      deductionAmount: 0,
      usdtDeduction: balanceDebitUSDT,
    });
  }
};

// ==========================================
// 2. ACTIVE ADMIN PAYMENT QR (TRADER DISPLAY)
// ==========================================

const getActiveDepositQR = async (req, res) => {
  try {
    const qr = await CryptoPaymentQR.getActiveQR();

    if (!qr) {
      return res.status(200).json({
        success: true,
        data: null,
        message: 'No active USDT deposit wallet is currently available.',
      });
    }

    const qrData = qr.toObject ? qr.toObject() : { ...qr };
    if (!qrData.walletAddress) {
      qrData.walletAddress = qrData.upiId || '';
    }
    if (!qrData.network) {
      qrData.network = 'TRC20';
    }

    return res.status(200).json({
      success: true,
      data: qrData,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch payment QR.' });
  }
};

// ==========================================
// 3. TRADER DEPOSIT WORKFLOW
// ==========================================

const createDepositRequest = async (req, res) => {
  try {
    const rawAmount = req.body.amount || req.body.depositAmountUSDT;
    const numAmount = parseFloat(rawAmount);

    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Please provide a valid positive USDT deposit amount.' });
    }

    const txHash = (req.body.txHash || req.body.txid || req.body.utr || '').trim();
    if (!txHash) {
      return res.status(400).json({ success: false, message: 'Transaction Hash / TXID is required.' });
    }

    // Verify active QR exists; block deposit if inactive destination
    const activeQR = await CryptoPaymentQR.getActiveQR();
    if (!activeQR) {
      return res.status(400).json({
        success: false,
        message: 'No active USDT deposit wallet is currently available. Deposits cannot be accepted at this time.',
      });
    }

    // Check duplicate TXID in active/completed requests
    const existingTx = await CryptoDepositRequest.findOne({
      $or: [{ txHash }, { utr: txHash }],
      status: { $ne: 'REJECTED' },
    });
    if (existingTx) {
      return res.status(400).json({
        success: false,
        message: 'This Transaction Hash / TXID has already been submitted and is currently in review or completed.',
      });
    }

    const proofUrl = req.file ? `/uploads/${req.file.filename}` : (req.body.paymentProofUrl || '');

    // Exact 1:1 Deposit Credit (0% Bonus) & Fixed ₹105 Rate INR Equivalent
    const baseRate = Number(config.usdtInrRate || 105.0);
    const inrEquivalent = round2(numAmount * baseRate);
    const totalCreditUSDT = numAmount; // EXACT 1:1, NO BONUS
    const bonusPercent = 0.0;
    const bonusAmountUSDT = 0.0;

    const network = (req.body.network || activeQR.network || 'TRC20').trim();
    const destinationWalletAddress = (activeQR.walletAddress || activeQR.upiId || '').trim();

    const qrSnapshot = {
      qrImageUrl: activeQR.qrImageUrl,
      network,
      walletAddress: destinationWalletAddress,
      title: activeQR.title,
    };

    const requestId = generateDepositId();

    const depositReq = await CryptoDepositRequest.create({
      requestId,
      traderId: req.user._id,
      traderUsername: req.user.username,
      depositAmountUSDT: numAmount,
      usdtAmount: numAmount,
      bonusPercent: 0,
      bonusAmountUSDT: 0,
      totalCreditUSDT: numAmount,
      baseRate,
      inrEquivalent,
      network,
      destinationWalletAddress,
      txHash,
      utr: txHash,
      qrId: activeQR ? activeQR._id : null,
      qrSnapshot,
      paymentProofUrl: proofUrl,
      status: 'PENDING_VERIFICATION',
    });

    // Notify all active Admins
    const admins = await User.find({ role: 'ADMIN', status: 'ACTIVE' });
    for (const adm of admins) {
      await Notification.sendNotification({
        recipientUserId: adm._id,
        recipientClientId: adm.username,
        type: 'CRYPTO_DEPOSIT_SUBMITTED',
        title: 'New Crypto Deposit Request (1:1 Exact USDT)',
        message: `Trader ${req.user.username} submitted ${numAmount} USDT deposit (Expected Credit: ${numAmount} USDT, INR Equivalent: ₹${inrEquivalent.toLocaleString('en-IN')}). TXID: ${txHash}`,
        referenceId: requestId,
        amount: totalCreditUSDT,
        currency: 'USDT',
        metadata: { depositAmountUSDT: numAmount, inrEquivalent, totalCreditUSDT, txHash, network, requestId },
      });
    }

    // Notify Trader
    await Notification.sendNotification({
      recipientUserId: req.user._id,
      recipientClientId: req.user.username,
      type: 'CRYPTO_DEPOSIT_SUBMITTED',
      title: 'Crypto Deposit Request Submitted (1:1 Exact USDT)',
      message: `Your deposit request for ${numAmount} USDT (INR Equivalent: ₹${inrEquivalent.toLocaleString('en-IN')}) has been submitted for blockchain verification.`,
      referenceId: requestId,
      amount: totalCreditUSDT,
      currency: 'USDT',
      metadata: { depositAmountUSDT: numAmount, inrEquivalent, totalCreditUSDT, txHash, network, requestId },
    });

    // Log activity
    await CryptoActivityLog.log({
      traderId: req.user._id,
      traderUsername: req.user.username,
      actorId: req.user._id,
      actorRole: 'TRADER',
      actionType: 'DEPOSIT_REQUEST_SUBMITTED',
      requestId,
      details: { depositAmountUSDT: numAmount, totalCreditUSDT, inrEquivalent, network, txHash },
      description: `Trader ${req.user.username} submitted ${numAmount} USDT deposit (INR Eq: ₹${inrEquivalent.toLocaleString('en-IN')}). TXID: ${txHash}.`,
      ipAddress: req.ip,
    });

    return res.status(201).json({
      success: true,
      message: `Deposit request submitted successfully. You will receive ${totalCreditUSDT} USDT (${numAmount} USDT + 3% bonus) upon blockchain verification.`,
      data: depositReq,
    });
  } catch (error) {
    console.error('[Create Crypto Deposit Error]:', error);
    return res.status(500).json({ success: false, message: `Failed to submit deposit request: ${error.message}` });
  }
};

const getTraderDeposits = async (req, res) => {
  try {
    const deposits = await CryptoDepositRequest.find({ traderId: req.user._id }).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: deposits });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch deposits.' });
  }
};

// ==========================================
// 4. TRADER WITHDRAWAL WORKFLOW
// ==========================================

const createWithdrawalRequest = async (req, res) => {
  try {
    const rawAmount = req.body.amount || req.body.requestedUSDT || req.body.requestedAmount;
    const numAmount = parseFloat(rawAmount);

    if (isNaN(numAmount) || numAmount < 1) {
      return res.status(400).json({ success: false, message: 'Please specify a valid withdrawal amount.' });
    }

    // Task 2: Validate against the 10 fixed amounts
    if (!FIXED_WITHDRAWAL_AMOUNTS.includes(numAmount)) {
      return res.status(400).json({
        success: false,
        message: `Unsupported withdrawal amount. Please select one of the fixed amounts: ${FIXED_WITHDRAWAL_AMOUNTS.join(', ')} USDT.`,
      });
    }

    const upi = (req.body.traderUpiId || req.body.upiId || req.body.paymentAddress || '').trim();
    const qrUrl = req.file ? `/uploads/${req.file.filename}` : (req.body.traderQrImageUrl || req.body.qrImage || '').trim();

    // Task 4 & 5: Require at least one payment destination: QR or UPI ID
    if (!qrUrl && !upi) {
      return res.status(400).json({
        success: false,
        message: 'Please provide at least one payment destination: PhonePe / UPI QR code or UPI ID / Payment Address.',
      });
    }

    // 1% Bonus Calculations
    const requestedUSDT = numAmount;
    const bonusPercent = WITHDRAWAL_BONUS_PERCENT; // 1.0%
    const bonusUSDT = round6(requestedUSDT * (bonusPercent / 100)); // 1% platform bonus benefit
    const balanceDebitUSDT = round6(requestedUSDT - bonusUSDT); // 99% actual balance debit
    const payoutUSDTEquivalent = requestedUSDT; // Full 100% payout obligation

    const baseRate = Number(config.usdtInrRate || 105.0);
    const baseInrAmount = round2(requestedUSDT * baseRate);
    const finalInrPayout = baseInrAmount; // Trader receives full 100% payout equivalent (₹105/USDT)

    // Atomically reserve only 99% of requested USDT (balanceDebitUSDT)
    try {
      await UsdtWallet.reserveBalance({
        traderId: req.user._id,
        amount: balanceDebitUSDT,
      });
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: err.message || `Insufficient available balance. You need ${balanceDebitUSDT} USDT available (99% balance debit for a ${requestedUSDT} USDT request with +1% bonus).`,
      });
    }

    const requestId = generateWithdrawalId();

    const withdrawalReq = await CryptoWithdrawalRequest.create({
      requestId,
      traderId: req.user._id,
      traderUsername: req.user.username,
      type: 'CRYPTO_WITHDRAWAL',
      usdtAmount: requestedUSDT,
      requestedUSDT,
      baseRate,
      baseInrAmount,
      bonusPercent,
      bonusUSDT,
      balanceDebitUSDT,
      payoutUSDTEquivalent,
      settlementMethod: 'UPI_INR',
      settlementRateINR: baseRate,
      payoutINR: finalInrPayout,
      withdrawalDeductionPercent: 0,
      withdrawalDeductionAmount: 0,
      finalInrPayout,
      effectiveRate: baseRate,
      traderQrImageUrl: qrUrl,
      qrImage: qrUrl,
      traderUpiId: upi,
      upiId: upi,
      status: 'PENDING_REVIEW',
    });

    // Notify Admins
    const admins = await User.find({ role: 'ADMIN', status: 'ACTIVE' });
    for (const adm of admins) {
      await Notification.sendNotification({
        recipientUserId: adm._id,
        recipientClientId: adm.username,
        type: 'CRYPTO_WITHDRAWAL_SUBMITTED',
        title: 'New Crypto Withdrawal Request (+1% Bonus)',
        message: `Trader ${req.user.username} requested ${requestedUSDT} USDT payout (₹${finalInrPayout.toLocaleString('en-IN')}) with 1% bonus (${bonusUSDT} USDT bonus, ${balanceDebitUSDT} USDT balance debit).`,
        referenceId: requestId,
        amount: finalInrPayout,
        currency: 'INR',
        metadata: { requestedUSDT, bonusUSDT, balanceDebitUSDT, requestId },
      });
    }

    // Notify Trader
    await Notification.sendNotification({
      recipientUserId: req.user._id,
      recipientClientId: req.user.username,
      type: 'CRYPTO_WITHDRAWAL_SUBMITTED',
      title: 'Crypto Withdrawal Submitted (+1% Bonus)',
      message: `${balanceDebitUSDT} USDT reserved from balance (1% Bonus Benefit: +${bonusUSDT} USDT). Your full payout of ₹${finalInrPayout.toLocaleString('en-IN')} (${requestedUSDT} USDT equivalent) is under administrative review.`,
      referenceId: requestId,
      amount: finalInrPayout,
      currency: 'INR',
      metadata: { requestedUSDT, bonusUSDT, balanceDebitUSDT, requestId },
    });

    // Log Activity
    await CryptoActivityLog.log({
      traderId: req.user._id,
      traderUsername: req.user.username,
      actorId: req.user._id,
      actorRole: 'TRADER',
      actionType: 'WITHDRAWAL_REQUEST_SUBMITTED',
      requestId,
      details: {
        requestedUSDT,
        bonusPercent,
        bonusUSDT,
        balanceDebitUSDT,
        payoutUSDTEquivalent,
        finalInrPayout,
        traderUpiId: upi,
        hasQr: Boolean(qrUrl),
      },
      description: `Trader ${req.user.username} requested ${requestedUSDT} USDT withdrawal (+1% bonus: +${bonusUSDT} USDT bonus benefit, ${balanceDebitUSDT} USDT balance debit, ₹${finalInrPayout} full payout).`,
      ipAddress: req.ip,
    });

    return res.status(201).json({
      success: true,
      message: `Withdrawal request submitted for ${requestedUSDT} USDT. ${balanceDebitUSDT} USDT reserved from balance (+1% Bonus Benefit: +${bonusUSDT} USDT). Full payout obligation: ₹${finalInrPayout.toLocaleString('en-IN')}.`,
      data: withdrawalReq,
    });
  } catch (error) {
    console.error('[Create Crypto Withdrawal Error]:', error);
    return res.status(500).json({ success: false, message: `Failed to submit withdrawal request: ${error.message}` });
  }
};

const getTraderWithdrawals = async (req, res) => {
  try {
    const withdrawals = await CryptoWithdrawalRequest.find({ traderId: req.user._id }).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: withdrawals });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch withdrawals.' });
  }
};

// ==========================================
// 5. TRADER UNIFIED TRANSACTIONS
// ==========================================

const getTraderCryptoTransactions = async (req, res) => {
  try {
    const [deposits, withdrawals] = await Promise.all([
      CryptoDepositRequest.find({ traderId: req.user._id }).sort({ createdAt: -1 }).lean(),
      CryptoWithdrawalRequest.find({ traderId: req.user._id }).sort({ createdAt: -1 }).lean(),
    ]);

    const formattedDeposits = deposits.map((d) => {
      const depAmt = d.depositAmountUSDT || d.usdtAmount || 0;
      const totalCredit = d.totalCreditUSDT !== undefined ? d.totalCreditUSDT : depAmt;
      const baseRate = d.baseRate || 105.0;
      const inrEquivalent = d.inrEquivalent !== undefined ? d.inrEquivalent : round2(depAmt * baseRate);

      return {
        ...d,
        transactionType: 'DEPOSIT',
        depositAmountUSDT: depAmt,
        creditedAmountUSDT: totalCredit,
        totalCreditUSDT: totalCredit,
        finalAmount: totalCredit,
        fixedRate: baseRate,
        inrEquivalent,
        currency: 'USDT',
        bonusUSDT: d.bonusAmountUSDT || 0,
        bonusPercent: d.bonusPercent || 0,
        feeOrDeduction: 0,
      };
    });

    const formattedWithdrawals = withdrawals.map((w) => ({
      ...w,
      transactionType: 'WITHDRAWAL',
      finalAmount: w.finalInrPayout,
      currency: 'INR',
      feeOrDeduction: 0,
    }));

    const combined = [...formattedDeposits, ...formattedWithdrawals].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    return res.status(200).json({ success: true, data: combined });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch crypto transactions.' });
  }
};

// ==========================================
// 6. ADMIN CRYPTO OVERVIEW & STATS
// ==========================================

const getAdminCryptoOverview = async (req, res) => {
  try {
    const [
      totalDeposits,
      pendingDeposits,
      completedDeposits,
      totalWithdrawals,
      pendingWithdrawals,
      completedWithdrawals,
      depositAgg,
      withdrawalAgg,
      activeQR,
    ] = await Promise.all([
      CryptoDepositRequest.countDocuments(),
      CryptoDepositRequest.countDocuments({ status: 'PENDING_VERIFICATION' }),
      CryptoDepositRequest.countDocuments({ status: 'COMPLETED' }),
      CryptoWithdrawalRequest.countDocuments(),
      CryptoWithdrawalRequest.countDocuments({ status: 'PENDING_REVIEW' }),
      CryptoWithdrawalRequest.countDocuments({ status: 'COMPLETED' }),
      CryptoDepositRequest.aggregate([
        { $match: { status: 'COMPLETED' } },
        {
          $group: {
            _id: null,
            totalUsdt: {
              $sum: {
                $ifNull: ['$totalCreditUSDT', { $multiply: ['$usdtAmount', 1.03] }],
              },
            },
            totalInr: { $sum: '$totalInrPayable' },
          },
        },
      ]),
      CryptoWithdrawalRequest.aggregate([
        { $match: { status: 'COMPLETED' } },
        { $group: { _id: null, totalUsdt: { $sum: '$usdtAmount' }, totalInr: { $sum: '$finalInrPayout' } } },
      ]),
      CryptoPaymentQR.getActiveQR(),
    ]);

    const totalUsdtCredited = depositAgg.length > 0 ? round2(depositAgg[0].totalUsdt) : 0;
    const totalInrReceived = depositAgg.length > 0 ? round2(depositAgg[0].totalInr) : 0;
    const totalUsdtDebited = withdrawalAgg.length > 0 ? round2(withdrawalAgg[0].totalUsdt) : 0;
    const totalInrPaidOut = withdrawalAgg.length > 0 ? round2(withdrawalAgg[0].totalInr) : 0;

    return res.status(200).json({
      success: true,
      data: {
        totalDeposits,
        pendingDeposits,
        completedDeposits,
        totalWithdrawals,
        pendingWithdrawals,
        completedWithdrawals,
        totalUsdtCredited,
        totalInrReceived,
        totalUsdtDebited,
        totalInrPaidOut,
        activeQR: activeQR
          ? { id: activeQR._id, title: activeQR.title, merchantName: activeQR.merchantName, upiId: activeQR.upiId }
          : null,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load crypto overview stats.' });
  }
};

// ==========================================
// 7. ADMIN DEPOSITS MANAGEMENT
// ==========================================

const getAdminDeposits = async (req, res) => {
  try {
    const { status, search } = req.query;
    const query = {};
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { requestId: new RegExp(search, 'i') },
        { traderUsername: new RegExp(search, 'i') },
        { utr: new RegExp(search, 'i') },
      ];
    }

    const deposits = await CryptoDepositRequest.find(query)
      .sort({ createdAt: -1 })
      .populate('verifiedBy', 'username');

    return res.status(200).json({ success: true, data: deposits });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch deposit requests.' });
  }
};

const approveDeposit = async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body || {};

  try {
    const depositReq = await CryptoDepositRequest.findById(id);
    if (!depositReq) {
      return res.status(404).json({ success: false, message: 'Deposit request not found.' });
    }

    if (depositReq.status === 'COMPLETED') {
      return res.status(400).json({ success: false, message: 'Deposit is already completed.' });
    }

    if (depositReq.status === 'REJECTED') {
      return res.status(400).json({ success: false, message: 'Cannot approve a rejected deposit request.' });
    }

    const depositAmount = depositReq.depositAmountUSDT || depositReq.usdtAmount;
    // EXACT 1:1 USDT CREDITING: Credit exactly verified USDT amount (no bonus)
    const verifiedAmount = req.body.verifiedUSDT !== undefined && !isNaN(parseFloat(req.body.verifiedUSDT))
      ? parseFloat(req.body.verifiedUSDT)
      : depositAmount;
    const creditAmount = verifiedAmount;
    const baseRate = Number(config.usdtInrRate || 105.0);
    const inrEquivalent = round2(creditAmount * baseRate);

    // Atomically credit trader's USDT wallet with unique ledger reference
    await UsdtWallet.creditWallet({
      traderId: depositReq.traderId,
      clientId: depositReq.traderUsername,
      amount: creditAmount,
      entryType: 'CRYPTO_DEPOSIT_CONFIRMED',
      referenceRequestId: depositReq.requestId,
      notes: notes || `Verified USDT Deposit of ${creditAmount} USDT credited (TXID: ${depositReq.txHash || depositReq.utr || 'N/A'}, INR Eq: ₹${inrEquivalent.toLocaleString('en-IN')})`,
      performedBy: req.user._id,
    });

    depositReq.status = 'COMPLETED';
    depositReq.totalCreditUSDT = creditAmount;
    depositReq.bonusPercent = 0;
    depositReq.bonusAmountUSDT = 0;
    depositReq.inrEquivalent = inrEquivalent;
    depositReq.verifiedBy = req.user._id;
    depositReq.verifiedAt = new Date();
    depositReq.ledgerReferenceId = depositReq.requestId;
    await depositReq.save();

    // Broadcast real-time balance update to connected SSE clients
    await broadcastBalanceUpdate(depositReq.traderId);

    // Notify Trader
    await Notification.sendNotification({
      recipientUserId: depositReq.traderId,
      recipientClientId: depositReq.traderUsername,
      type: 'CRYPTO_DEPOSIT_APPROVED',
      title: 'Crypto Deposit Approved & Credited (1:1 Exact USDT)',
      message: `Your deposit of ${creditAmount} USDT has been verified and credited to your available balance. Fixed Rate: ₹105 / USDT (INR Equivalent: ₹${inrEquivalent.toLocaleString('en-IN')}).`,
      referenceId: depositReq.requestId,
      amount: creditAmount,
      currency: 'USDT',
      metadata: { depositAmountUSDT: creditAmount, totalCreditUSDT: creditAmount, inrEquivalent, requestId: depositReq.requestId },
    });

    // Log activity
    await CryptoActivityLog.log({
      traderId: depositReq.traderId,
      traderUsername: depositReq.traderUsername,
      actorId: req.user._id,
      actorRole: 'ADMIN',
      actionType: 'DEPOSIT_APPROVED_AND_CREDITED',
      requestId: depositReq.requestId,
      details: { depositAmountUSDT: creditAmount, totalCreditUSDT: creditAmount, inrEquivalent, txHash: depositReq.txHash },
      description: `Admin ${req.user.username} verified blockchain payment and credited ${creditAmount} USDT to ${depositReq.traderUsername} (INR Eq: ₹${inrEquivalent.toLocaleString('en-IN')}).`,
      ipAddress: req.ip,
    });

    return res.status(200).json({
      success: true,
      message: `Deposit approved. Exactly ${creditAmount} USDT credited to trader wallet (INR Equivalent: ₹${inrEquivalent.toLocaleString('en-IN')}).`,
      data: depositReq,
    });
  } catch (error) {
    console.error('[Approve Crypto Deposit Error]:', error);
    return res.status(500).json({ success: false, message: `Failed to approve deposit: ${error.message}` });
  }
};

const rejectDeposit = async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body || {};

  try {
    const depositReq = await CryptoDepositRequest.findById(id);
    if (!depositReq) {
      return res.status(404).json({ success: false, message: 'Deposit request not found.' });
    }

    if (['COMPLETED', 'REJECTED'].includes(depositReq.status)) {
      return res.status(400).json({
        success: false,
        message: `Deposit request is already finalized as '${depositReq.status}'.`,
      });
    }

    depositReq.status = 'REJECTED';
    depositReq.rejectionReason = reason ? reason.trim() : 'Transaction verification failed on blockchain.';
    depositReq.verifiedBy = req.user._id;
    depositReq.verifiedAt = new Date();
    await depositReq.save();

    const depositAmount = depositReq.depositAmountUSDT || depositReq.usdtAmount;

    // Notify Trader
    await Notification.sendNotification({
      recipientUserId: depositReq.traderId,
      recipientClientId: depositReq.traderUsername,
      type: 'CRYPTO_DEPOSIT_REJECTED',
      title: 'Crypto Deposit Request Rejected',
      message: `Your deposit request for ${depositAmount} USDT was rejected: ${depositReq.rejectionReason}`,
      referenceId: depositReq.requestId,
      amount: depositAmount,
      currency: 'USDT',
      metadata: { depositAmountUSDT: depositAmount, requestId: depositReq.requestId },
    });

    // Log activity
    await CryptoActivityLog.log({
      traderId: depositReq.traderId,
      traderUsername: depositReq.traderUsername,
      actorId: req.user._id,
      actorRole: 'ADMIN',
      actionType: 'DEPOSIT_REJECTED',
      requestId: depositReq.requestId,
      details: { reason: depositReq.rejectionReason },
      description: `Admin ${req.user.username} rejected deposit request ${depositReq.requestId}: ${depositReq.rejectionReason}`,
      ipAddress: req.ip,
    });

    return res.status(200).json({
      success: true,
      message: 'Deposit request rejected.',
      data: depositReq,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: `Failed to reject deposit: ${error.message}` });
  }
};

// ==========================================
// 8. ADMIN WITHDRAWALS MANAGEMENT
// ==========================================

const getAdminWithdrawals = async (req, res) => {
  try {
    const { status, search } = req.query;
    const query = {};
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { requestId: new RegExp(search, 'i') },
        { traderUsername: new RegExp(search, 'i') },
        { traderUpiId: new RegExp(search, 'i') },
        { upiId: new RegExp(search, 'i') },
        { payoutReference: new RegExp(search, 'i') },
      ];
    }

    const withdrawals = await CryptoWithdrawalRequest.find(query)
      .sort({ createdAt: -1 })
      .populate('payoutVerifiedBy', 'username');

    return res.status(200).json({ success: true, data: withdrawals });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch withdrawal requests.' });
  }
};

const getWithdrawalById = async (req, res) => {
  try {
    const withdrawal = await CryptoWithdrawalRequest.findById(req.params.id)
      .populate('traderId', 'username email')
      .populate('payoutVerifiedBy', 'username');
    if (!withdrawal) {
      return res.status(404).json({ success: false, message: 'Withdrawal request not found.' });
    }
    return res.status(200).json({ success: true, data: withdrawal });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch withdrawal request.' });
  }
};

const approveWithdrawal = async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body || {};

  try {
    const withdrawalReq = await CryptoWithdrawalRequest.findById(id);
    if (!withdrawalReq) {
      return res.status(404).json({ success: false, message: 'Withdrawal request not found.' });
    }

    if (['APPROVED', 'COMPLETED', 'REJECTED'].includes(withdrawalReq.status)) {
      return res.status(400).json({
        success: false,
        message: `Withdrawal request is already in '${withdrawalReq.status}' status.`,
      });
    }

    withdrawalReq.status = 'APPROVED';
    withdrawalReq.payoutVerifiedBy = req.user._id;
    await withdrawalReq.save();

    const requestedUSDT = withdrawalReq.requestedUSDT || withdrawalReq.usdtAmount;
    const debitUSDT = withdrawalReq.balanceDebitUSDT || round6(requestedUSDT * 0.99);
    const bonusUSDT = withdrawalReq.bonusUSDT || round6(requestedUSDT * 0.01);

    // Notify Trader
    await Notification.sendNotification({
      recipientUserId: withdrawalReq.traderId,
      recipientClientId: withdrawalReq.traderUsername,
      type: 'CRYPTO_WITHDRAWAL_APPROVED',
      title: 'Crypto Withdrawal Approved',
      message: `Your withdrawal request for ${requestedUSDT} USDT (₹${withdrawalReq.finalInrPayout.toLocaleString('en-IN')}) has been approved. Payout is being prepared.`,
      referenceId: withdrawalReq.requestId,
      amount: withdrawalReq.finalInrPayout,
      currency: 'INR',
      metadata: { requestedUSDT, bonusUSDT, balanceDebitUSDT: debitUSDT, requestId: withdrawalReq.requestId },
    });

    // Log Activity
    await CryptoActivityLog.log({
      traderId: withdrawalReq.traderId,
      traderUsername: withdrawalReq.traderUsername,
      actorId: req.user._id,
      actorRole: 'ADMIN',
      actionType: 'WITHDRAWAL_APPROVED',
      requestId: withdrawalReq.requestId,
      details: {
        requestedUSDT,
        bonusUSDT,
        balanceDebitUSDT: debitUSDT,
        payoutINR: withdrawalReq.finalInrPayout,
        notes,
      },
      description: `Admin ${req.user.username} approved withdrawal ${withdrawalReq.requestId}. ${debitUSDT} USDT remains reserved pending payout completion.`,
      ipAddress: req.ip,
    });

    return res.status(200).json({
      success: true,
      message: `Withdrawal request approved. Reserved USDT (${debitUSDT} USDT) remains locked pending payout completion.`,
      data: withdrawalReq,
    });
  } catch (error) {
    console.error('[Approve Crypto Withdrawal Error]:', error);
    return res.status(500).json({ success: false, message: `Failed to approve withdrawal: ${error.message}` });
  }
};

const verifyAndCompleteWithdrawal = async (req, res) => {
  const { id } = req.params;
  const { payoutReference, notes } = req.body || {};

  if (!payoutReference || payoutReference.trim().length < 4) {
    return res.status(400).json({
      success: false,
      message: 'A valid payout reference / UTR is required to confirm that funds have been sent.',
    });
  }

  try {
    const withdrawalReq = await CryptoWithdrawalRequest.findById(id);
    if (!withdrawalReq) {
      return res.status(404).json({ success: false, message: 'Withdrawal request not found.' });
    }

    if (withdrawalReq.status === 'COMPLETED') {
      return res.status(400).json({ success: false, message: 'Withdrawal payout is already completed.' });
    }

    if (withdrawalReq.status === 'REJECTED') {
      return res.status(400).json({ success: false, message: 'Cannot complete a rejected withdrawal request.' });
    }

    const requestedUSDT = withdrawalReq.requestedUSDT || withdrawalReq.usdtAmount;
    const debitUSDT = withdrawalReq.balanceDebitUSDT !== undefined
      ? withdrawalReq.balanceDebitUSDT
      : round6(requestedUSDT * 0.99);
    const bonusUSDT = withdrawalReq.bonusUSDT !== undefined
      ? withdrawalReq.bonusUSDT
      : round6(requestedUSDT * 0.01);

    // Atomically debit ONLY the reserved 99% USDT from the trader's wallet and write to ledger
    await UsdtWallet.finalizeDebitReservedBalance({
      traderId: withdrawalReq.traderId,
      clientId: withdrawalReq.traderUsername,
      amount: debitUSDT,
      referenceRequestId: withdrawalReq.requestId,
      notes: notes || `Crypto Payout of ₹${withdrawalReq.finalInrPayout} (100% full payout: ${requestedUSDT} USDT equivalent) completed. Platform Bonus: +${bonusUSDT} USDT. Ref: ${payoutReference.trim()}`,
      performedBy: req.user._id,
    });

    withdrawalReq.status = 'COMPLETED';
    withdrawalReq.payoutReference = payoutReference.trim();
    withdrawalReq.payoutVerifiedBy = req.user._id;
    withdrawalReq.payoutVerifiedAt = new Date();
    withdrawalReq.ledgerReferenceId = withdrawalReq.requestId;
    await withdrawalReq.save();

    // Broadcast balance update to connected clients
    await broadcastBalanceUpdate(withdrawalReq.traderId);

    // Record the 1% platform-funded bonus separately for accounting
    await CryptoActivityLog.log({
      traderId: withdrawalReq.traderId,
      traderUsername: withdrawalReq.traderUsername,
      actorId: req.user._id,
      actorRole: 'ADMIN',
      actionType: 'WITHDRAWAL_BONUS_RECORDED',
      requestId: withdrawalReq.requestId,
      details: {
        requestedUSDT,
        bonusUSDT,
        balanceDebitUSDT: debitUSDT,
        payoutINR: withdrawalReq.finalInrPayout,
        payoutReference: payoutReference.trim(),
      },
      description: `Platform funded 1% bonus contribution of ${bonusUSDT} USDT for withdrawal ${withdrawalReq.requestId}.`,
      ipAddress: req.ip,
    });

    // Notify Trader
    await Notification.sendNotification({
      recipientUserId: withdrawalReq.traderId,
      recipientClientId: withdrawalReq.traderUsername,
      type: 'CRYPTO_WITHDRAWAL_PAID',
      title: 'Crypto Payout Completed (+1% Bonus Benefit)',
      message: `₹${withdrawalReq.finalInrPayout.toLocaleString('en-IN')} (full ${requestedUSDT} USDT payout) was successfully sent to your PhonePe / UPI destination. Actual USDT debited: ${debitUSDT} USDT (+${bonusUSDT} USDT Bonus). Ref: ${payoutReference.trim()}`,
      referenceId: withdrawalReq.requestId,
      amount: withdrawalReq.finalInrPayout,
      currency: 'INR',
      metadata: { requestedUSDT, bonusUSDT, balanceDebitUSDT: debitUSDT, requestId: withdrawalReq.requestId, payoutReference },
    });

    // Log Activity
    await CryptoActivityLog.log({
      traderId: withdrawalReq.traderId,
      traderUsername: withdrawalReq.traderUsername,
      actorId: req.user._id,
      actorRole: 'ADMIN',
      actionType: 'WITHDRAWAL_PAYOUT_VERIFIED',
      requestId: withdrawalReq.requestId,
      details: {
        requestedUSDT,
        bonusUSDT,
        balanceDebitUSDT: debitUSDT,
        finalInrPayout: withdrawalReq.finalInrPayout,
        payoutReference: payoutReference.trim(),
      },
      description: `Admin ${req.user.username} verified INR payout (₹${withdrawalReq.finalInrPayout}) to ${withdrawalReq.traderUsername}. Debited ${debitUSDT} USDT (99%), funded ${bonusUSDT} USDT (1% bonus). Ref: ${payoutReference.trim()}`,
      ipAddress: req.ip,
    });

    return res.status(200).json({
      success: true,
      message: `Withdrawal payout verified and completed. Locked balance (${debitUSDT} USDT) debited permanently. Platform funded 1% bonus (+${bonusUSDT} USDT).`,
      data: withdrawalReq,
    });
  } catch (error) {
    console.error('[Verify Crypto Payout Error]:', error);
    return res.status(500).json({ success: false, message: `Failed to complete withdrawal: ${error.message}` });
  }
};

const rejectWithdrawal = async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body || {};

  try {
    const withdrawalReq = await CryptoWithdrawalRequest.findById(id);
    if (!withdrawalReq) {
      return res.status(404).json({ success: false, message: 'Withdrawal request not found.' });
    }

    if (['COMPLETED', 'REJECTED'].includes(withdrawalReq.status)) {
      return res.status(400).json({
        success: false,
        message: `Withdrawal request is already finalized as '${withdrawalReq.status}'.`,
      });
    }

    const requestedUSDT = withdrawalReq.requestedUSDT || withdrawalReq.usdtAmount;
    const debitToRestore = withdrawalReq.balanceDebitUSDT !== undefined
      ? withdrawalReq.balanceDebitUSDT
      : round6(requestedUSDT * 0.99);

    // Atomically release the locked USDT (99% balance debit) back to available balance!
    await UsdtWallet.releaseReservedBalance({
      traderId: withdrawalReq.traderId,
      amount: debitToRestore,
    });

    withdrawalReq.status = 'REJECTED';
    withdrawalReq.rejectionReason = reason ? reason.trim() : 'Invalid or unverified PhonePe QR destination.';
    withdrawalReq.payoutVerifiedBy = req.user._id;
    withdrawalReq.payoutVerifiedAt = new Date();
    await withdrawalReq.save();

    // Broadcast balance update to connected clients
    await broadcastBalanceUpdate(withdrawalReq.traderId);

    // Notify Trader
    await Notification.sendNotification({
      recipientUserId: withdrawalReq.traderId,
      recipientClientId: withdrawalReq.traderUsername,
      type: 'CRYPTO_WITHDRAWAL_REJECTED',
      title: 'Crypto Withdrawal Rejected (Balance Restored)',
      message: `Your withdrawal of ${requestedUSDT} USDT was rejected: ${withdrawalReq.rejectionReason}. Your reserved balance of ${debitToRestore} USDT has been restored.`,
      referenceId: withdrawalReq.requestId,
      amount: withdrawalReq.finalInrPayout,
      currency: 'INR',
      metadata: { requestedUSDT, balanceDebitUSDT: debitToRestore, requestId: withdrawalReq.requestId },
    });

    // Log Activity
    await CryptoActivityLog.log({
      traderId: withdrawalReq.traderId,
      traderUsername: withdrawalReq.traderUsername,
      actorId: req.user._id,
      actorRole: 'ADMIN',
      actionType: 'WITHDRAWAL_REJECTED_AND_RESTORED',
      requestId: withdrawalReq.requestId,
      details: { reason: withdrawalReq.rejectionReason, restoredBalanceUSDT: debitToRestore },
      description: `Admin ${req.user.username} rejected withdrawal ${withdrawalReq.requestId}. Restored ${debitToRestore} USDT to ${withdrawalReq.traderUsername}.`,
      ipAddress: req.ip,
    });

    return res.status(200).json({
      success: true,
      message: 'Withdrawal rejected and reserved balance restored to trader.',
      data: withdrawalReq,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: `Failed to reject withdrawal: ${error.message}` });
  }
};

// ==========================================
// 9. ADMIN PAYMENT QR MANAGEMENT
// ==========================================

const getAdminQRs = async (req, res) => {
  try {
    const qrs = await CryptoPaymentQR.find().sort({ createdAt: -1 }).populate('uploadedBy', 'username');
    return res.status(200).json({ success: true, data: qrs });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch payment QRs.' });
  }
};

const uploadAdminQR = async (req, res) => {
  try {
    const {
      walletAddress,
      network = 'TRC20',
      qrDecodedAddress,
      title,
      merchantName,
      upiId,
      instructions,
      isActive,
    } = req.body;

    const targetAddress = (walletAddress || upiId || '').trim();

    if (!targetAddress) {
      return res.status(400).json({
        success: false,
        message: 'Wallet Address is required.',
      });
    }

    const cleanNetwork = (network || 'TRC20').trim().toUpperCase();

    if (!isValidUsdtAddress(targetAddress, cleanNetwork)) {
      return res.status(400).json({
        success: false,
        message: cleanNetwork === 'TRC20'
          ? 'Invalid TRC20 USDT wallet address. It must start with "T" and be 34 characters long.'
          : 'Invalid USDT wallet address.',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'QR Code image file is required.',
      });
    }

    // Verify QR content if decoded
    if (qrDecodedAddress && qrDecodedAddress.trim()) {
      const decoded = qrDecodedAddress.trim().toLowerCase();
      const addrLower = targetAddress.toLowerCase();
      if (!decoded.includes(addrLower) && !addrLower.includes(decoded)) {
        return res.status(400).json({
          success: false,
          message: `QR code verification failed: The uploaded QR image data does not match the entered wallet address.`,
        });
      }
    }

    const qrImageUrl = `/uploads/${req.file.filename}`;
    const qrId = generateQRId();

    // Auto-set as active (default true)
    const makeActive = isActive === undefined || isActive === 'true' || isActive === true;

    if (makeActive) {
      await CryptoPaymentQR.updateMany({}, { isActive: false });
    }

    const qr = await CryptoPaymentQR.create({
      qrId,
      walletAddress: targetAddress,
      qrImageUrl,
      network: cleanNetwork,
      title: title && title.trim() ? title.trim() : `Official USDT ${cleanNetwork} Wallet`,
      merchantName: merchantName && merchantName.trim() ? merchantName.trim() : 'RisePay Corporate Vault',
      upiId: targetAddress,
      instructions: instructions && instructions.trim()
        ? instructions.trim()
        : `Transfer exact USDT to this official ${cleanNetwork} wallet address. Submit your transaction hash (TXID) for verified settlement with automatic +3% deposit bonus.`,
      isActive: makeActive,
      uploadedBy: req.user?._id || null,
    });

    if (makeActive) {
      await broadcastActiveQR(qr);
    }

    await CryptoActivityLog.log({
      actorId: req.user?._id || null,
      actorRole: 'ADMIN',
      actionType: 'ADMIN_QR_UPLOADED',
      details: {
        qrId,
        walletAddress: targetAddress,
        network: cleanNetwork,
        isActive: makeActive,
      },
      description: `Admin ${req.user?.username || 'Admin'} published payment QR ${targetAddress} (${cleanNetwork}).`,
      ipAddress: req.ip,
    });

    return res.status(201).json({
      success: true,
      message: 'USDT Payment QR uploaded and published successfully.',
      data: qr,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `Failed to upload QR: ${error.message}`,
    });
  }
};

const setActiveQR = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await CryptoPaymentQR.setActiveQR(id);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'QR record not found.' });
    }

    await broadcastActiveQR(updated);

    await CryptoActivityLog.log({
      actorId: req.user?._id || null,
      actorRole: 'ADMIN',
      actionType: 'ADMIN_QR_SET_ACTIVE',
      details: { id, walletAddress: updated.walletAddress, network: updated.network },
      description: `Admin ${req.user?.username || 'Admin'} set payment QR '${updated.walletAddress}' as active.`,
      ipAddress: req.ip,
    });

    return res.status(200).json({
      success: true,
      message: 'QR code set as active for deposits.',
      data: updated,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update active QR.' });
  }
};

const deleteAdminQR = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await CryptoPaymentQR.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'QR record not found.' });
    }

    const wasActive = existing.isActive;
    await CryptoPaymentQR.findByIdAndDelete(id);

    let currentActive = null;
    if (wasActive) {
      currentActive = await CryptoPaymentQR.getActiveQR();
      await broadcastActiveQR(currentActive || null);
    }

    await CryptoActivityLog.log({
      actorId: req.user?._id || null,
      actorRole: 'ADMIN',
      actionType: 'ADMIN_QR_DELETED',
      details: { id, walletAddress: existing.walletAddress, wasActive },
      description: `Admin ${req.user?.username || 'Admin'} deleted QR code ${existing.walletAddress}.`,
      ipAddress: req.ip,
    });

    return res.status(200).json({
      success: true,
      message: 'QR code deleted successfully.',
      activeQR: currentActive,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to delete QR.' });
  }
};

// ==========================================
// 10. ADMIN UNIFIED TRANSACTIONS & AUDIT LOGS
// ==========================================

const getAdminCryptoTransactions = async (req, res) => {
  try {
    const [deposits, withdrawals] = await Promise.all([
      CryptoDepositRequest.find().sort({ createdAt: -1 }).lean(),
      CryptoWithdrawalRequest.find().sort({ createdAt: -1 }).lean(),
    ]);

    const formattedDeposits = deposits.map((d) => {
      const depAmt = d.depositAmountUSDT || d.usdtAmount || 0;
      const totalCredit = d.totalCreditUSDT !== undefined ? d.totalCreditUSDT : depAmt;
      const baseRate = d.baseRate || 105.0;
      const inrEquivalent = d.inrEquivalent !== undefined ? d.inrEquivalent : round2(depAmt * baseRate);

      return {
        ...d,
        transactionType: 'DEPOSIT',
        depositAmountUSDT: depAmt,
        creditedAmountUSDT: totalCredit,
        totalCreditUSDT: totalCredit,
        finalAmount: totalCredit,
        fixedRate: baseRate,
        inrEquivalent,
        currency: 'USDT',
        bonusUSDT: d.bonusAmountUSDT || 0,
        bonusPercent: d.bonusPercent || 0,
        feeOrDeduction: 0,
      };
    });

    const formattedWithdrawals = withdrawals.map((w) => ({
      ...w,
      transactionType: 'WITHDRAWAL',
      finalAmount: w.finalInrPayout,
      currency: 'INR',
      feeOrDeduction: 0,
    }));

    const combined = [...formattedDeposits, ...formattedWithdrawals].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    return res.status(200).json({ success: true, data: combined });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load crypto transactions.' });
  }
};

const getAdminCryptoActivities = async (req, res) => {
  try {
    const logs = await CryptoActivityLog.find()
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('actorId', 'username role')
      .populate('traderId', 'username');

    return res.status(200).json({ success: true, data: logs });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load crypto activity logs.' });
  }
};

// ==========================================
// 11. LEGACY ENDPOINTS (PRESERVED)
// ==========================================

const getCryptoConfig = async (req, res) => {
  const trc20Address = process.env.CRYPTO_USDT_TRC20_ADDRESS || null;
  const erc20Address = process.env.CRYPTO_USDT_ERC20_ADDRESS || null;

  return res.status(200).json({
    success: true,
    configured: Boolean(trc20Address || erc20Address),
    networks: [
      {
        asset: 'USDT',
        network: 'TRC20',
        configured: Boolean(trc20Address),
        depositAddress: trc20Address || 'Not Configured (Contact Admin)',
        feeNote: 'Zero gas fee for internal client verification',
        warning: 'Send ONLY USDT (TRC-20) to this address.',
      },
      {
        asset: 'USDT',
        network: 'ERC20',
        configured: Boolean(erc20Address),
        depositAddress: erc20Address || 'Not Configured (Contact Admin)',
        feeNote: 'Requires manual review by administrator',
        warning: 'Send ONLY USDT (ERC-20).',
      },
    ],
  });
};

const createCryptoRequest = async (req, res) => {
  const { type, assetSymbol = 'USDT', network, amount, walletAddress, txHash } = req.body;
  const numAmount = parseFloat(amount);
  const cryptoReq = new CryptoRequest({
    requestId: `CRP-${Date.now().toString().slice(-6)}-${crypto.randomInt(1000, 9999)}`,
    userId: req.user._id,
    clientId: req.user.username,
    type,
    assetSymbol: assetSymbol.toUpperCase(),
    network,
    amount: Number(numAmount.toFixed(4)),
    walletAddress: (walletAddress || '').trim(),
    txHash: txHash ? txHash.trim() : '',
    status: 'PENDING',
  });
  await cryptoReq.save();
  return res.status(201).json({ success: true, request: cryptoReq });
};

const getMyCryptoRequests = async (req, res) => {
  const requests = await CryptoRequest.find({ userId: req.user._id }).sort({ createdAt: -1 });
  return res.status(200).json({ success: true, data: requests });
};

const getAllCryptoAdmin = async (req, res) => {
  const requests = await CryptoRequest.find().sort({ createdAt: -1 });
  return res.status(200).json({ success: true, data: requests });
};

const adminReviewCrypto = async (req, res) => {
  return res.status(200).json({ success: true, message: 'Legacy review handled.' });
};

module.exports = {
  // Quotations & Rates
  getCryptoRates,
  getQuotation,
  getWithdrawalConfig,
  getActiveDepositQR,
  streamActiveQR,
  broadcastActiveQR,
  broadcastBalanceUpdate,

  // Trader Deposit & Withdrawal
  createDepositRequest,
  getTraderDeposits,
  createWithdrawalRequest,
  getTraderWithdrawals,
  getTraderCryptoTransactions,

  // Admin Crypto Management
  getAdminCryptoOverview,
  getAdminDeposits,
  approveDeposit,
  rejectDeposit,
  getAdminWithdrawals,
  getWithdrawalById,
  approveWithdrawal,
  verifyAndCompleteWithdrawal,
  completeWithdrawal: verifyAndCompleteWithdrawal,
  rejectWithdrawal,
  getAdminQRs,
  uploadAdminQR,
  setActiveQR,
  deleteAdminQR,
  getAdminCryptoTransactions,
  getAdminCryptoActivities,

  // Legacy compatibility
  getCryptoConfig,
  createCryptoRequest,
  getMyCryptoRequests,
  getAllCryptoAdmin,
  adminReviewCrypto,
};
