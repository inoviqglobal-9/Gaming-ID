const crypto = require('crypto');
const DepositRequest = require('../models/DepositRequest');
const DepositConfig = require('../models/DepositConfig');
const BalanceLedger = require('../models/BalanceLedger');
const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');
const User = require('../models/User');

const generateRequestId = () => {
  return `TDR-${Date.now().toString().slice(-6)}-${crypto.randomInt(1000, 9999)}`;
};

// Helper to format deposit document for responses
const formatDepositDoc = (doc) => {
  return {
    _id: doc._id,
    requestId: doc.requestId,
    depositType: doc.depositType,
    depositTypeLabel:
      doc.depositType === 'SECURITY_DEPOSIT' ? 'Security deposit' : 'Working deposit',
    amount: doc.amount,
    currency: doc.currency || 'USDT',
    network: doc.network || 'TRC20',
    wallet: doc.wallet || doc.destinationWalletSnapshot?.address || '-',
    destinationWalletSnapshot: doc.destinationWalletSnapshot || {},
    txHash: doc.txHash || doc.proofReference || '-',
    screenshot: doc.screenshot || doc.proofImage || '-',
    status: doc.status || 'DRAFT',
    verification: doc.verification || 'NOT_CHECKED',
    verificationSource: doc.verificationSource || 'MANUAL_AUDIT',
    clientNotes: doc.clientNotes || '',
    adminDecisionNotes: doc.adminDecisionNotes || '',
    rejectionReason: doc.rejectionReason || doc.adminDecisionNotes || '',
    createdAt: doc.createdAt,
    submittedAt: doc.submittedAt,
    approvedAt: doc.approvedAt || doc.verifiedAt,
    expiresAt: doc.expiresAt,
    auditHistory: doc.auditHistory || [],
    trader: doc.userId
      ? {
          _id: doc.userId._id || doc.userId,
          username: doc.userId.username || doc.clientId,
          fullName: doc.userId.fullName || '',
          email: doc.userId.email || '',
        }
      : {
          username: doc.clientId,
        },
  };
};

// Check and mark expired records
const checkAndExpireRequests = async (query = {}) => {
  try {
    const now = new Date();
    await DepositRequest.updateMany(
      {
        ...query,
        status: { $in: ['DRAFT', 'PENDING', 'AWAITING_PAYMENT'] },
        expiresAt: { $ne: null, $lt: now },
      },
      {
        $set: { status: 'EXPIRED' },
      }
    );
  } catch (err) {
    console.warn('[checkAndExpireRequests] Warning:', err.message);
  }
};

// ==========================================
// TRADER CONTROLLERS
// ==========================================

// GET /api/trader/deposit-settings
const getTraderDepositSettings = async (req, res) => {
  try {
    const config = await DepositConfig.getOrCreateDefault();
    const userId = req.user._id;

    // Check if there is an active draft or pending request for this trader
    await checkAndExpireRequests({ userId });
    const now = new Date();
    const activeRequest = await DepositRequest.findOne({
      userId,
      status: { $in: ['DRAFT', 'PENDING', 'AWAITING_PAYMENT'] },
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    }).sort({ createdAt: -1 });

    const activeWallets = (config.destinationWallets || []).filter((w) => w.isActive !== false);

    return res.status(200).json({
      success: true,
      data: {
        workingDepositEnabled: config.workingDepositEnabled !== false,
        securityDepositEnabled: config.securityDepositEnabled !== false,
        minDepositAmountUsdt: config.minDepositAmountUsdt || 50,
        maxDepositAmountUsdt: config.maxDepositAmountUsdt || 100000,
        minDepositAmountInr: config.minDepositAmountInr || 1000,
        maxDepositAmountInr: config.maxDepositAmountInr || 5000000,
        allowedCurrencies: config.allowedCurrencies || ['USDT', 'INR'],
        depositExpiryMinutes: config.depositExpiryMinutes || 120,
        destinationWallets: activeWallets,
        activeRequest: activeRequest ? formatDepositDoc(activeRequest) : null,
      },
    });
  } catch (error) {
    console.error('[getTraderDepositSettings Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve deposit settings.',
    });
  }
};

// GET /api/trader/deposit-requests & /api/deposit/my
const getTraderDepositRequests = async (req, res) => {
  try {
    const userId = req.user._id;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20));

    // Automatically transition expired drafts
    await checkAndExpireRequests({ userId });

    const filter = { userId };
    if (req.query.status && req.query.status !== 'ALL') {
      filter.status = req.query.status.toUpperCase();
    }
    if (req.query.depositType && req.query.depositType !== 'ALL') {
      filter.depositType = req.query.depositType.toUpperCase();
    }

    const total = await DepositRequest.countDocuments(filter);
    const rawDocs = await DepositRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const data = rawDocs.map(formatDepositDoc);
    const totalPages = Math.ceil(total / limit) || 1;
    const from = total === 0 ? 0 : (page - 1) * limit + 1;
    const to = Math.min(page * limit, total);

    return res.status(200).json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        from,
        to,
      },
    });
  } catch (error) {
    console.error('[getTraderDepositRequests Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch deposit requests.',
    });
  }
};

// POST /api/trader/deposit-requests & /api/deposit
const createTraderDepositRequest = async (req, res) => {
  const { depositType = 'WORKING_DEPOSIT', amount, currency = 'USDT', clientNotes } = req.body;
  const numAmount = parseFloat(amount);

  if (!numAmount || numAmount <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a valid deposit amount greater than zero.',
    });
  }

  const cleanDepositType =
    depositType.toUpperCase() === 'SECURITY_DEPOSIT' ? 'SECURITY_DEPOSIT' : 'WORKING_DEPOSIT';
  const cleanCurrency = currency.toUpperCase() === 'INR' ? 'INR' : 'USDT';
  const network = cleanCurrency === 'USDT' ? 'TRC20' : 'IMPS/NEFT';

  try {
    const config = await DepositConfig.getOrCreateDefault();
    const userId = req.user._id;

    // Validate type permissions
    if (cleanDepositType === 'WORKING_DEPOSIT' && config.workingDepositEnabled === false) {
      return res.status(400).json({
        success: false,
        message: 'Working deposits are currently disabled by administrator.',
      });
    }
    if (cleanDepositType === 'SECURITY_DEPOSIT' && config.securityDepositEnabled === false) {
      return res.status(400).json({
        success: false,
        message: 'Security deposits are currently disabled by administrator.',
      });
    }

    // Validate amount boundaries
    const minAmount = cleanCurrency === 'USDT' ? config.minDepositAmountUsdt : config.minDepositAmountInr;
    const maxAmount = cleanCurrency === 'USDT' ? config.maxDepositAmountUsdt : config.maxDepositAmountInr;
    if (numAmount < minAmount) {
      return res.status(400).json({
        success: false,
        message: `Minimum deposit amount for ${cleanCurrency} is ${minAmount}.`,
      });
    }
    if (maxAmount && numAmount > maxAmount) {
      return res.status(400).json({
        success: false,
        message: `Maximum deposit amount for ${cleanCurrency} is ${maxAmount}.`,
      });
    }

    // Check if Trader already has an active unexpired draft or awaiting payment request
    await checkAndExpireRequests({ userId });
    const now = new Date();
    const existingActive = await DepositRequest.findOne({
      userId,
      status: { $in: ['DRAFT', 'PENDING', 'AWAITING_PAYMENT'] },
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    }).sort({ createdAt: -1 });

    if (existingActive) {
      return res.status(200).json({
        success: true,
        message: 'You already have an active deposit request. Continue payment for the existing request.',
        isExisting: true,
        isExistingActive: true,
        data: formatDepositDoc(existingActive),
      });
    }

    // Assign authorized destination wallet
    const assignedWallet = (config.destinationWallets || []).find(
      (w) => w.currency === cleanCurrency && w.isActive !== false
    ) || {
      address: cleanCurrency === 'USDT' ? 'TQr8Vp6K9vW2Z4yL1m5N7q3J8xH2gB9dF1' : 'HDFC0001234 / 50200012345678',
      network,
      currency: cleanCurrency,
      label: cleanCurrency === 'USDT' ? 'Primary Corporate USDT-TRC20 Vault' : 'Corporate Escrow Account',
    };

    const expiryDurationMinutes = config.depositExpiryMinutes || 120;
    const expiresAt = new Date(Date.now() + expiryDurationMinutes * 60 * 1000);
    const requestId = generateRequestId();

    const deposit = new DepositRequest({
      requestId,
      userId,
      clientId: req.user.username,
      depositType: cleanDepositType,
      amount: Number(numAmount.toFixed(2)),
      currency: cleanCurrency,
      network,
      wallet: assignedWallet.address,
      destinationWalletSnapshot: {
        address: assignedWallet.address,
        network: assignedWallet.network || network,
        currency: cleanCurrency,
        label: assignedWallet.label || '',
      },
      status: 'DRAFT',
      verification: 'NOT_CHECKED',
      clientNotes: clientNotes ? clientNotes.trim() : '',
      expiresAt,
      auditHistory: [
        {
          action: 'DEPOSIT_DRAFT_CREATED',
          performedBy: userId,
          timestamp: new Date(),
          notes: `Created ${cleanDepositType} for ${numAmount} ${cleanCurrency}`,
          newStatus: 'DRAFT',
        },
      ],
    });

    await deposit.save();

    await AuditLog.log({
      action: 'DEPOSIT_REQUEST_CREATED',
      user: req.user,
      ipAddress: req.ip || '',
      userAgent: req.get('User-Agent') || '',
      details: {
        requestId,
        depositType: cleanDepositType,
        amount: deposit.amount,
        currency: deposit.currency,
        wallet: deposit.wallet,
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Deposit request recorded. Please complete payment within the expiration time.',
      data: formatDepositDoc(deposit),
    });
  } catch (error) {
    console.error('[createTraderDepositRequest Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to create deposit request.',
    });
  }
};

// GET /api/trader/deposit-requests/:id
const getTraderDepositRequestById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const query = {
      $and: [
        { userId },
        {
          $or: [
            { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null },
            { requestId: id },
          ].filter(Boolean),
        },
      ],
    };

    const doc = await DepositRequest.findOne(query);
    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'Deposit request not found or unauthorized.',
      });
    }

    // Check expiration on-the-fly
    if (
      ['DRAFT', 'PENDING', 'AWAITING_PAYMENT'].includes(doc.status) &&
      doc.expiresAt &&
      doc.expiresAt < new Date()
    ) {
      doc.status = 'EXPIRED';
      await doc.save();
    }

    return res.status(200).json({
      success: true,
      data: formatDepositDoc(doc),
    });
  } catch (error) {
    console.error('[getTraderDepositRequestById Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch deposit details.',
    });
  }
};

// POST /api/trader/deposit-requests/:id/submit-evidence
const submitTraderDepositEvidence = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const { txHash, clientNotes } = req.body;

    const cleanTxHash = (txHash || '').trim();
    if (!cleanTxHash || !/^[a-fA-F0-9]{64}$/.test(cleanTxHash)) {
      return res.status(400).json({
        success: false,
        message: 'TRON transaction hash must be exactly 64 hexadecimal characters.',
      });
    }

    const query = {
      $and: [
        { userId },
        {
          $or: [
            { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null },
            { requestId: id },
          ].filter(Boolean),
        },
      ],
    };

    const deposit = await DepositRequest.findOne(query);
    if (!deposit) {
      return res.status(404).json({
        success: false,
        message: 'Deposit request not found or unauthorized.',
      });
    }

    // Check expiration
    if (deposit.expiresAt && deposit.expiresAt < new Date()) {
      deposit.status = 'EXPIRED';
      await deposit.save();
      return res.status(400).json({
        success: false,
        message: 'This deposit request has expired. Please create a new deposit request.',
      });
    }

    if (!['DRAFT', 'PENDING', 'AWAITING_PAYMENT'].includes(deposit.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot submit payment evidence for request in '${deposit.status}' status.`,
      });
    }

    // Check duplicate TX hash across other records
    const duplicate = await DepositRequest.findOne({
      txHash: cleanTxHash,
      _id: { $ne: deposit._id },
    });
    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: 'This transaction hash has already been submitted on another request.',
      });
    }

    // Handle uploaded file if present
    let screenshotUrl = deposit.screenshot;
    if (req.file) {
      screenshotUrl = `/uploads/${req.file.filename}`;
    } else if (req.body.screenshot) {
      screenshotUrl = req.body.screenshot;
    }

    deposit.txHash = cleanTxHash;
    deposit.proofReference = cleanTxHash;
    if (screenshotUrl && screenshotUrl !== '-') {
      deposit.screenshot = screenshotUrl;
      deposit.proofImage = screenshotUrl;
    }
    if (clientNotes) deposit.clientNotes = clientNotes.trim();

    deposit.submittedAt = new Date();
    deposit.status = 'SUBMITTED';
    deposit.verification = 'CHECKING';

    deposit.auditHistory.push({
      action: 'PAYMENT_EVIDENCE_SUBMITTED',
      performedBy: userId,
      timestamp: new Date(),
      notes: `Submitted TX Hash: ${cleanTxHash}`,
      previousStatus: 'DRAFT',
      newStatus: 'SUBMITTED',
    });

    await deposit.save();

    await AuditLog.log({
      action: 'DEPOSIT_EVIDENCE_SUBMITTED',
      user: req.user,
      ipAddress: req.ip || '',
      userAgent: req.get('User-Agent') || '',
      details: {
        requestId: deposit.requestId,
        txHash: cleanTxHash,
        amount: deposit.amount,
        currency: deposit.currency,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Deposit payment evidence submitted successfully. Awaiting administrative verification.',
      data: formatDepositDoc(deposit),
    });
  } catch (error) {
    console.error('[submitTraderDepositEvidence Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: `Failed to submit payment evidence: ${error.message}`,
    });
  }
};

// ==========================================
// ADMIN CONTROLLERS
// ==========================================

// GET /api/admin/deposit-requests & /api/deposit/admin
const getAllDepositsAdmin = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20));

    await checkAndExpireRequests();

    const filter = {};
    if (req.query.status && req.query.status !== 'ALL') {
      filter.status = req.query.status.toUpperCase();
    }
    if (req.query.depositType && req.query.depositType !== 'ALL') {
      filter.depositType = req.query.depositType.toUpperCase();
    }
    if (req.query.verification && req.query.verification !== 'ALL') {
      filter.verification = req.query.verification.toUpperCase();
    }
    if (req.query.currency && req.query.currency !== 'ALL') {
      filter.currency = req.query.currency.toUpperCase();
    }
    if (req.query.traderId) {
      filter.userId = req.query.traderId;
    }

    if (req.query.search) {
      const s = req.query.search.trim();
      filter.$or = [
        { requestId: { $regex: s, $options: 'i' } },
        { clientId: { $regex: s, $options: 'i' } },
        { txHash: { $regex: s, $options: 'i' } },
        { proofReference: { $regex: s, $options: 'i' } },
        { wallet: { $regex: s, $options: 'i' } },
      ];
    }

    if (req.query.dateFrom) {
      const dFrom = new Date(req.query.dateFrom);
      if (!isNaN(dFrom.getTime())) {
        dFrom.setHours(0, 0, 0, 0);
        filter.createdAt = { ...filter.createdAt, $gte: dFrom };
      }
    }
    if (req.query.dateTo) {
      const dTo = new Date(req.query.dateTo);
      if (!isNaN(dTo.getTime())) {
        dTo.setHours(23, 59, 59, 999);
        filter.createdAt = { ...filter.createdAt, $lte: dTo };
      }
    }

    const total = await DepositRequest.countDocuments(filter);
    const rawDocs = await DepositRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('userId', 'username fullName role status email')
      .populate('approvedBy', 'username')
      .lean();

    const data = rawDocs.map(formatDepositDoc);
    const totalPages = Math.ceil(total / limit) || 1;
    const from = total === 0 ? 0 : (page - 1) * limit + 1;
    const to = Math.min(page * limit, total);

    return res.status(200).json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        from,
        to,
      },
    });
  } catch (error) {
    console.error('[getAllDepositsAdmin Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch deposit requests for admin.',
    });
  }
};

// GET /api/admin/deposit-requests/:id
const getAdminDepositById = async (req, res) => {
  try {
    const { id } = req.params;
    const query = {
      $or: [
        { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null },
        { requestId: id },
      ].filter(Boolean),
    };

    const doc = await DepositRequest.findOne(query)
      .populate('userId', 'username fullName role status email')
      .populate('approvedBy', 'username')
      .populate('auditHistory.performedBy', 'username role')
      .lean();

    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'Deposit request not found.',
      });
    }

    return res.status(200).json({
      success: true,
      data: formatDepositDoc(doc),
    });
  } catch (error) {
    console.error('[getAdminDepositById Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch deposit request.',
    });
  }
};

// PATCH /api/admin/deposit-requests/:id/review & /api/deposit/admin/:id/review
const adminReviewDeposit = async (req, res) => {
  const { id } = req.params;
  const {
    action, // 'APPROVE' / 'CONFIRM', 'REJECT', 'UNDER_REVIEW', 'UPDATE_VERIFICATION'
    verificationStatus, // 'NOT_CHECKED', 'CHECKING', 'VERIFIED', 'FAILED'
    decisionNotes = '',
    rejectionReason = '',
    verificationReference = '',
  } = req.body;

  try {
    const deposit = await DepositRequest.findOne({
      $or: [
        { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null },
        { requestId: id },
      ].filter(Boolean),
    });

    if (!deposit) {
      return res.status(404).json({
        success: false,
        message: 'Deposit request not found.',
      });
    }

    if (['APPROVED', 'CONFIRMED', 'REJECTED'].includes(deposit.status)) {
      return res.status(400).json({
        success: false,
        message: `This deposit request is already finalized as '${deposit.status}'. Status is immutable.`,
      });
    }

    const previousStatus = deposit.status;

    // 1. Update Verification status only
    if (action === 'UPDATE_VERIFICATION') {
      if (['NOT_CHECKED', 'CHECKING', 'VERIFIED', 'FAILED'].includes(verificationStatus)) {
        deposit.verification = verificationStatus;
        if (verificationReference) deposit.verificationSource = verificationReference;
      }
      deposit.auditHistory.push({
        action: 'VERIFICATION_UPDATED',
        performedBy: req.user._id,
        timestamp: new Date(),
        notes: `Verification status set to ${deposit.verification}`,
        previousStatus: deposit.status,
        newStatus: deposit.status,
      });
      await deposit.save();
      return res.status(200).json({
        success: true,
        message: `Verification status updated to ${deposit.verification}.`,
        data: formatDepositDoc(deposit),
      });
    }

    // 2. Mark Under Review
    if (action === 'UNDER_REVIEW') {
      deposit.status = 'UNDER_REVIEW';
      deposit.verification = 'CHECKING';
      deposit.adminDecisionNotes = decisionNotes || 'Under verification';
      deposit.auditHistory.push({
        action: 'STATUS_UNDER_REVIEW',
        performedBy: req.user._id,
        timestamp: new Date(),
        notes: decisionNotes,
        previousStatus,
        newStatus: 'UNDER_REVIEW',
      });
      await deposit.save();
      return res.status(200).json({
        success: true,
        message: 'Deposit marked as Under Review.',
        data: formatDepositDoc(deposit),
      });
    }

    // 3. Reject Deposit
    if (action === 'REJECT') {
      const reason = rejectionReason || decisionNotes || 'Deposit rejected after verification.';
      deposit.status = 'REJECTED';
      deposit.verification = 'FAILED';
      deposit.rejectionReason = reason;
      deposit.adminDecisionNotes = reason;
      deposit.verifiedAt = new Date();
      deposit.verifiedBy = req.user._id;

      deposit.auditHistory.push({
        action: 'DEPOSIT_REJECTED',
        performedBy: req.user._id,
        timestamp: new Date(),
        notes: reason,
        previousStatus,
        newStatus: 'REJECTED',
      });

      await deposit.save();

      await AuditLog.log({
        action: 'DEPOSIT_REJECTED',
        user: req.user,
        targetUserId: deposit.userId,
        targetUsername: deposit.clientId,
        ipAddress: req.ip || '',
        userAgent: req.get('User-Agent') || '',
        details: { requestId: deposit.requestId, reason },
      });

      await Notification.sendNotification({
        recipientUserId: deposit.userId,
        recipientClientId: deposit.clientId,
        type: 'DEPOSIT_REJECTED',
        title: 'Deposit Request Rejected',
        message: `Your deposit request ${deposit.requestId} (${deposit.amount} ${deposit.currency}) was rejected. Reason: ${reason}`,
        paymentId: deposit.requestId,
        amount: deposit.amount,
        currency: deposit.currency,
      });

      return res.status(200).json({
        success: true,
        message: 'Deposit request rejected.',
        data: formatDepositDoc(deposit),
      });
    }

    // 4. Approve Deposit (Atomic balance ledger credit with duplicate protection)
    if (action === 'APPROVE' || action === 'CONFIRM') {
      // Execute verified ledger entry
      await BalanceLedger.recordVerifiedEntry({
        userId: deposit.userId,
        clientId: deposit.clientId,
        currency: deposit.currency,
        entryType: 'DEPOSIT_CONFIRMED',
        amount: deposit.amount,
        referenceRequestId: deposit.requestId,
        notes: decisionNotes || `Deposit verified: TX ${deposit.txHash || 'N/A'} to ${deposit.wallet}`,
        performedBy: req.user._id,
      });

      deposit.status = 'APPROVED';
      deposit.verification = 'VERIFIED';
      deposit.approvedAt = new Date();
      deposit.approvedBy = req.user._id;
      deposit.verifiedAt = deposit.approvedAt;
      deposit.verifiedBy = req.user._id;
      deposit.adminDecisionNotes = decisionNotes || 'Deposit approved and balance credited';

      deposit.auditHistory.push({
        action: 'DEPOSIT_APPROVED',
        performedBy: req.user._id,
        timestamp: new Date(),
        notes: decisionNotes || 'Approved by administrator',
        previousStatus,
        newStatus: 'APPROVED',
      });

      await deposit.save();

      await AuditLog.log({
        action: 'DEPOSIT_CONFIRMED_CREDITED',
        user: req.user,
        targetUserId: deposit.userId,
        targetUsername: deposit.clientId,
        ipAddress: req.ip || '',
        userAgent: req.get('User-Agent') || '',
        details: {
          requestId: deposit.requestId,
          amount: deposit.amount,
          currency: deposit.currency,
          txHash: deposit.txHash,
        },
      });

      await Notification.sendNotification({
        recipientUserId: deposit.userId,
        recipientClientId: deposit.clientId,
        type: 'DEPOSIT_CONFIRMED',
        title: 'Deposit Approved',
        message: `Your deposit ${deposit.requestId} of ${deposit.amount} ${deposit.currency} was verified and credited to your wallet balance.`,
        paymentId: deposit.requestId,
        amount: deposit.amount,
        currency: deposit.currency,
        referenceId: deposit.txHash,
      });

      return res.status(200).json({
        success: true,
        message: `Deposit approved! ${deposit.currency} ${deposit.amount} credited to Trader balance.`,
        data: formatDepositDoc(deposit),
      });
    }

    return res.status(400).json({
      success: false,
      message: "Invalid action. Supported actions: 'APPROVE', 'REJECT', 'UNDER_REVIEW', 'UPDATE_VERIFICATION'.",
    });
  } catch (error) {
    console.error('[adminReviewDeposit Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: `Failed to review deposit: ${error.message}`,
    });
  }
};

// GET /api/admin/deposit-settings
const getAdminDepositSettings = async (req, res) => {
  try {
    const config = await DepositConfig.getOrCreateDefault();
    return res.status(200).json({
      success: true,
      data: config,
    });
  } catch (error) {
    console.error('[getAdminDepositSettings Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve admin deposit settings.',
    });
  }
};

// PATCH /api/admin/deposit-settings
const updateAdminDepositSettings = async (req, res) => {
  try {
    const config = await DepositConfig.getOrCreateDefault();
    const {
      workingDepositEnabled,
      securityDepositEnabled,
      minDepositAmountUsdt,
      maxDepositAmountUsdt,
      minDepositAmountInr,
      maxDepositAmountInr,
      allowedCurrencies,
      depositExpiryMinutes,
      destinationWallets,
    } = req.body;

    if (workingDepositEnabled !== undefined) config.workingDepositEnabled = Boolean(workingDepositEnabled);
    if (securityDepositEnabled !== undefined) config.securityDepositEnabled = Boolean(securityDepositEnabled);
    if (minDepositAmountUsdt !== undefined) config.minDepositAmountUsdt = Number(minDepositAmountUsdt);
    if (maxDepositAmountUsdt !== undefined) config.maxDepositAmountUsdt = Number(maxDepositAmountUsdt);
    if (minDepositAmountInr !== undefined) config.minDepositAmountInr = Number(minDepositAmountInr);
    if (maxDepositAmountInr !== undefined) config.maxDepositAmountInr = Number(maxDepositAmountInr);
    if (depositExpiryMinutes !== undefined) config.depositExpiryMinutes = Number(depositExpiryMinutes);
    if (Array.isArray(allowedCurrencies)) config.allowedCurrencies = allowedCurrencies;
    if (Array.isArray(destinationWallets)) config.destinationWallets = destinationWallets;

    config.updatedBy = req.user._id;
    await config.save();

    await AuditLog.log({
      action: 'DEPOSIT_SETTINGS_UPDATED',
      user: req.user,
      ipAddress: req.ip || '',
      userAgent: req.get('User-Agent') || '',
      details: {
        workingDepositEnabled: config.workingDepositEnabled,
        securityDepositEnabled: config.securityDepositEnabled,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Deposit settings updated successfully.',
      data: config,
    });
  } catch (error) {
    console.error('[updateAdminDepositSettings Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to update deposit settings.',
    });
  }
};

module.exports = {
  getTraderDepositSettings,
  getTraderDepositRequests,
  createTraderDepositRequest,
  getTraderDepositRequestById,
  submitTraderDepositEvidence,
  getAllDepositsAdmin,
  getAdminDepositById,
  adminReviewDeposit,
  getAdminDepositSettings,
  updateAdminDepositSettings,
  // Backward compatibility aliases
  createDeposit: createTraderDepositRequest,
  getMyDeposits: getTraderDepositRequests,
};
