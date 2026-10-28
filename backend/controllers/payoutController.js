const mongoose = require('mongoose');
const crypto = require('crypto');
const PayoutRequest = require('../models/PayoutRequest');
const BalanceLedger = require('../models/BalanceLedger');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');

const generateRequestId = () => {
  return `POT-${Date.now().toString().slice(-6)}-${crypto.randomInt(1000, 9999)}`;
};

// Helper to mask account number e.g. "•••• •••• 4589"
const maskAccount = (str) => {
  if (!str) return '';
  const clean = str.trim();
  if (clean.length <= 4) return clean;
  return '•••• ' + clean.slice(-4);
};

// ==========================================
// TRADER PAYOUT ENDPOINTS
// ==========================================

// GET /api/trader/payouts/settings
const getTraderPayoutSettings = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('payoutEnabled username');
    const isEnabled = user && user.payoutEnabled !== false;
    return res.status(200).json({
      success: true,
      payoutEnabled: isEnabled,
      username: req.user.username,
    });
  } catch (error) {
    console.error('[getTraderPayoutSettings Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve payout settings.',
    });
  }
};

// GET /api/trader/payouts/active
const getTraderActivePayout = async (req, res) => {
  try {
    // Find assigned or currently claimed payout for this trader
    const activePayout = await PayoutRequest.findOne({
      userId: req.user._id,
      status: { $in: ['ASSIGNED', 'CLAIMED'] },
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      activePayout: activePayout || null,
      payoutEnabled: req.user.payoutEnabled !== false,
    });
  } catch (error) {
    console.error('[getTraderActivePayout Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve active payout.',
    });
  }
};

// GET /api/trader/payouts/history
const getTraderPayoutHistory = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const status = req.query.status;
    const search = req.query.search;

    const filter = { userId: req.user._id };
    if (status && status !== 'ALL') {
      filter.status = status.toUpperCase();
    }
    if (search && search.trim()) {
      const regex = { $regex: search.trim(), $options: 'i' };
      filter.$or = [
        { requestId: regex },
        { 'recipientDetails.accountHolder': regex },
        { 'recipientDetails.ifscOrUpi': regex },
      ];
    }

    const total = await PayoutRequest.countDocuments(filter);
    const requests = await PayoutRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return res.status(200).json({
      success: true,
      data: requests,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    console.error('[getTraderPayoutHistory Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to load payout history.',
    });
  }
};

// POST /api/trader/payouts/:id/claim
const claimTraderPayout = async (req, res) => {
  const { id } = req.params;

  try {
    // 1. Verify Trader payout permission
    const traderUser = await User.findById(req.user._id);
    if (!traderUser || traderUser.payoutEnabled === false) {
      return res.status(403).json({
        success: false,
        message: 'Administrator has disabled payouts for your account.',
      });
    }

    // 2. Find Payout belonging to this Trader
    const payoutFilter = { userId: req.user._id };
    if (mongoose.Types.ObjectId.isValid(id)) {
      payoutFilter.$or = [{ _id: id }, { requestId: id }];
    } else {
      payoutFilter.requestId = id;
    }
    const payout = await PayoutRequest.findOne(payoutFilter);

    if (!payout) {
      return res.status(404).json({
        success: false,
        message: 'Assigned payout not found or access denied.',
      });
    }

    // 3. Status check
    if (payout.status === 'CLAIMED') {
      return res.status(400).json({
        success: false,
        message: 'This payout has already been claimed.',
      });
    }

    if (payout.status !== 'ASSIGNED') {
      return res.status(400).json({
        success: false,
        message: `Payout cannot be claimed. Current status is '${payout.status}'.`,
      });
    }

    // 4. Expiry check
    if (payout.expiresAt && new Date() > new Date(payout.expiresAt)) {
      payout.status = 'EXPIRED';
      await payout.save();
      return res.status(400).json({
        success: false,
        message: 'This assigned payout has expired.',
      });
    }

    // 5. Atomically update status
    payout.status = 'CLAIMED';
    payout.claimedAt = new Date();
    await payout.save();

    await AuditLog.log({
      action: 'PAYOUT_CLAIMED',
      user: req.user,
      ipAddress: req.ip || '',
      userAgent: req.get('User-Agent') || '',
      details: {
        payoutId: payout.requestId,
        amount: payout.amount,
        currency: payout.currency,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Payout successfully claimed. Awaiting administrative processing.',
      payout,
    });
  } catch (error) {
    console.error('[claimTraderPayout Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to claim payout.',
    });
  }
};

// GET /api/trader/payouts/history/export
const exportTraderPayoutHistoryCsv = async (req, res) => {
  try {
    const status = req.query.status;
    const filter = { userId: req.user._id };
    if (status && status !== 'ALL') filter.status = status.toUpperCase();

    const requests = await PayoutRequest.find(filter).sort({ createdAt: -1 });

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const headers = [
      'Payout ID',
      'Amount',
      'Currency',
      'Beneficiary',
      'Account / Masked Details',
      'Status',
      'Assigned Date',
      'Claimed Date',
      'Completed Date',
      'Notes',
    ];

    const rows = requests.map((item) => [
      escapeCsv(item.requestId),
      escapeCsv(item.amount),
      escapeCsv(item.currency),
      escapeCsv(item.recipientDetails?.accountHolder || ''),
      escapeCsv(
        item.recipientDetails?.accountNumberMasked ||
        item.recipientDetails?.ifscOrUpi ||
        item.recipientDetails?.walletAddressMasked ||
        ''
      ),
      escapeCsv(item.status),
      escapeCsv(item.assignedAt ? new Date(item.assignedAt).toISOString() : ''),
      escapeCsv(item.claimedAt ? new Date(item.claimedAt).toISOString() : ''),
      escapeCsv(item.completedAt ? new Date(item.completedAt).toISOString() : ''),
      escapeCsv(item.adminDecisionNotes || item.assignmentNotes || ''),
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="inrpay_payouts_${req.user.username}_${Date.now()}.csv"`
    );
    return res.status(200).send(csvContent);
  } catch (error) {
    console.error('[exportTraderPayoutHistoryCsv Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to export payout history.',
    });
  }
};

// ==========================================
// ADMIN PAYOUT ENDPOINTS
// ==========================================

// GET /api/admin/payouts (Admin views all with stats)
const getAllPayoutsAdmin = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 15;
    const status = req.query.status;
    const search = req.query.search;
    const currency = req.query.currency;
    const traderId = req.query.traderId;

    const filter = {};
    if (status && status !== 'ALL') filter.status = status.toUpperCase();
    if (currency) filter.currency = currency.toUpperCase();
    if (traderId) filter.userId = traderId;

    if (search && search.trim()) {
      filter.$or = [
        { clientId: { $regex: search.trim(), $options: 'i' } },
        { requestId: { $regex: search.trim(), $options: 'i' } },
        { 'recipientDetails.accountHolder': { $regex: search.trim(), $options: 'i' } },
        { 'recipientDetails.ifscOrUpi': { $regex: search.trim(), $options: 'i' } },
      ];
    }

    const total = await PayoutRequest.countDocuments(filter);
    const requests = await PayoutRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('userId', 'username fullName status payoutEnabled')
      .populate('assignedBy', 'username')
      .populate('processedBy', 'username');

    // Aggregate statistics for the Admin Dashboard
    const totalPayouts = await PayoutRequest.countDocuments();
    const activePayouts = await PayoutRequest.countDocuments({
      status: { $in: ['ASSIGNED', 'CLAIMED', 'PROCESSING'] },
    });
    const pendingPayouts = await PayoutRequest.countDocuments({
      status: { $in: ['PENDING', 'ASSIGNED'] },
    });
    const claimedPayouts = await PayoutRequest.countDocuments({ status: 'CLAIMED' });
    const completedPayouts = await PayoutRequest.countDocuments({ status: 'COMPLETED' });
    const failedPayouts = await PayoutRequest.countDocuments({
      status: { $in: ['FAILED', 'REJECTED', 'CANCELLED', 'EXPIRED'] },
    });
    const disabledTraders = await User.countDocuments({
      role: { $in: ['TRADER', 'CLIENT'] },
      payoutEnabled: false,
    });

    return res.status(200).json({
      success: true,
      data: requests,
      stats: {
        totalPayouts,
        activePayouts,
        pendingPayouts,
        claimedPayouts,
        completedPayouts,
        failedPayouts,
        disabledTraders,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    console.error('[Admin getAllPayouts Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch payout requests.',
    });
  }
};

// GET /api/admin/payouts/:id
const getAdminPayoutById = async (req, res) => {
  try {
    const payout = await PayoutRequest.findById(req.params.id)
      .populate('userId', 'username fullName email mobile status payoutEnabled')
      .populate('assignedBy', 'username')
      .populate('processedBy', 'username');

    if (!payout) {
      return res.status(404).json({
        success: false,
        message: 'Payout record not found.',
      });
    }

    return res.status(200).json({
      success: true,
      payout,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// POST /api/admin/payouts/assign (Admin assigns payout to Trader)
const adminAssignPayout = async (req, res) => {
  const {
    traderId,
    amount,
    currency = 'INR',
    beneficiaryName,
    accountNumber,
    ifscOrUpi,
    notes,
    expiresInHours,
  } = req.body;

  if (!traderId) {
    return res.status(400).json({
      success: false,
      message: 'Please select a Trader to assign the payout.',
    });
  }

  const numAmount = parseFloat(amount);
  if (!numAmount || numAmount <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Valid payout amount greater than zero is required.',
    });
  }

  if (!beneficiaryName || beneficiaryName.trim().length < 2) {
    return res.status(400).json({
      success: false,
      message: 'Beneficiary account holder name is required.',
    });
  }

  try {
    // Find target Trader
    const traderFilter = { role: { $in: ['TRADER', 'CLIENT'] } };
    if (mongoose.Types.ObjectId.isValid(traderId)) {
      traderFilter.$or = [{ _id: traderId }, { username: traderId }];
    } else {
      traderFilter.username = traderId;
    }
    const trader = await User.findOne(traderFilter);

    if (!trader) {
      return res.status(404).json({
        success: false,
        message: 'Target Trader account not found.',
      });
    }

    const requestId = generateRequestId();
    let expiresAt = null;
    if (expiresInHours && Number(expiresInHours) > 0) {
      expiresAt = new Date(Date.now() + Number(expiresInHours) * 3600 * 1000);
    }

    const payout = new PayoutRequest({
      requestId,
      userId: trader._id,
      clientId: trader.username,
      amount: Number(numAmount.toFixed(2)),
      currency: currency.toUpperCase(),
      recipientDetails: {
        accountHolder: beneficiaryName.trim(),
        accountNumberMasked: accountNumber ? maskAccount(accountNumber) : '',
        ifscOrUpi: ifscOrUpi ? ifscOrUpi.trim() : '',
      },
      status: 'ASSIGNED',
      assignedBy: req.user._id,
      assignedAt: new Date(),
      expiresAt,
      assignmentNotes: notes ? notes.trim() : '',
    });

    await payout.save();

    await AuditLog.log({
      action: 'PAYOUT_ASSIGNED_BY_ADMIN',
      user: req.user,
      targetUserId: trader._id,
      targetUsername: trader.username,
      ipAddress: req.ip || '',
      userAgent: req.get('User-Agent') || '',
      details: {
        requestId,
        amount: payout.amount,
        currency: payout.currency,
        beneficiary: beneficiaryName.trim(),
      },
    });

    return res.status(201).json({
      success: true,
      message: `Payout ${requestId} successfully assigned to Trader ${trader.username}.`,
      payout,
    });
  } catch (error) {
    console.error('[Admin Assign Payout Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to assign payout.',
    });
  }
};

// PATCH /api/admin/payouts/:id (Admin reviews / updates payout status)
const adminReviewPayout = async (req, res) => {
  const { id } = req.params;
  const { status, decisionNotes, reference } = req.body;

  const validStatuses = [
    'ASSIGNED',
    'CLAIMED',
    'UNDER_REVIEW',
    'APPROVED',
    'PROCESSING',
    'COMPLETED',
    'REJECTED',
    'FAILED',
    'CANCELLED',
    'EXPIRED',
  ];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message: `Invalid status. Permitted values: ${validStatuses.join(', ')}`,
    });
  }

  try {
    const payoutFilter = {};
    if (mongoose.Types.ObjectId.isValid(id)) {
      payoutFilter.$or = [{ _id: id }, { requestId: id }];
    } else {
      payoutFilter.requestId = id;
    }
    const payout = await PayoutRequest.findOne(payoutFilter);

    if (!payout) {
      return res.status(404).json({
        success: false,
        message: 'Payout request not found.',
      });
    }

    if (['COMPLETED', 'REJECTED', 'CANCELLED'].includes(payout.status)) {
      return res.status(400).json({
        success: false,
        message: `Payout is already finalized as '${payout.status}' and cannot be altered.`,
      });
    }

    // When marking COMPLETED: record deduction in ledger
    if (status === 'COMPLETED') {
      if (!reference && !decisionNotes) {
        return res.status(400).json({
          success: false,
          message: 'A verified transaction reference or decision note is required to complete payout.',
        });
      }

      await BalanceLedger.recordVerifiedEntry({
        userId: payout.userId,
        clientId: payout.clientId,
        currency: payout.currency,
        entryType: 'PAYOUT_DEDUCTED',
        amount: -payout.amount,
        referenceRequestId: payout.requestId,
        notes: `Payout completed: Ref ${reference || decisionNotes}`,
        performedBy: req.user._id,
      });

      payout.status = 'COMPLETED';
      payout.adminDecisionNotes = decisionNotes || `Completed with reference: ${reference}`;
      payout.completedAt = new Date();
      payout.processedBy = req.user._id;
      await payout.save();

      await AuditLog.log({
        action: 'PAYOUT_COMPLETED',
        user: req.user,
        targetUserId: payout.userId,
        targetUsername: payout.clientId,
        ipAddress: req.ip || '',
        userAgent: req.get('User-Agent') || '',
        details: { requestId: payout.requestId, amount: payout.amount, currency: payout.currency, reference },
      });

      return res.status(200).json({
        success: true,
        message: 'Payout marked COMPLETED and balance deducted from ledger.',
        payout,
      });
    }

    // For other transitions
    payout.status = status;
    if (decisionNotes) payout.adminDecisionNotes = decisionNotes;
    payout.processedBy = req.user._id;
    await payout.save();

    await AuditLog.log({
      action: `PAYOUT_STATUS_${status}`,
      user: req.user,
      targetUserId: payout.userId,
      targetUsername: payout.clientId,
      ipAddress: req.ip || '',
      userAgent: req.get('User-Agent') || '',
      details: { requestId: payout.requestId, newStatus: status, notes: decisionNotes },
    });

    return res.status(200).json({
      success: true,
      message: `Payout request updated to '${status}'.`,
      payout,
    });
  } catch (error) {
    console.error('[Admin Review Payout Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: `Failed to update payout: ${error.message}`,
    });
  }
};

// GET /api/admin/traders/:id/payout-settings
const adminGetTraderPayoutSettings = async (req, res) => {
  try {
    const { id } = req.params;
    const traderFilter = { role: { $in: ['TRADER', 'CLIENT'] } };
    if (mongoose.Types.ObjectId.isValid(id)) {
      traderFilter.$or = [{ _id: id }, { username: id }];
    } else {
      traderFilter.username = id;
    }
    const trader = await User.findOne(traderFilter).select('username fullName status payoutEnabled');

    if (!trader) {
      return res.status(404).json({
        success: false,
        message: 'Trader account not found.',
      });
    }

    const activePayoutCount = await PayoutRequest.countDocuments({
      userId: trader._id,
      status: { $in: ['ASSIGNED', 'CLAIMED', 'PROCESSING'] },
    });

    const totalPayoutCount = await PayoutRequest.countDocuments({
      userId: trader._id,
    });

    return res.status(200).json({
      success: true,
      trader: {
        id: trader._id,
        username: trader.username,
        fullName: trader.fullName || '',
        status: trader.status,
        payoutEnabled: trader.payoutEnabled !== false,
        activePayoutCount,
        totalPayoutCount,
      },
    });
  } catch (error) {
    console.error('[adminGetTraderPayoutSettings Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve trader payout settings.',
    });
  }
};

// PATCH /api/admin/traders/:id/payout-settings (Admin toggles payout permission)
const adminUpdateTraderPayoutSettings = async (req, res) => {
  try {
    const { id } = req.params;
    const { payoutEnabled } = req.body;

    const traderFilter = { role: { $in: ['TRADER', 'CLIENT'] } };
    if (mongoose.Types.ObjectId.isValid(id)) {
      traderFilter.$or = [{ _id: id }, { username: id }];
    } else {
      traderFilter.username = id;
    }
    const trader = await User.findOne(traderFilter);

    if (!trader) {
      return res.status(404).json({
        success: false,
        message: 'Trader account not found.',
      });
    }

    const newPermission = Boolean(payoutEnabled);
    trader.payoutEnabled = newPermission;
    await trader.save();

    await AuditLog.log({
      action: newPermission ? 'TRADER_PAYOUTS_ENABLED' : 'TRADER_PAYOUTS_DISABLED',
      user: req.user,
      targetUserId: trader._id,
      targetUsername: trader.username,
      ipAddress: req.ip || '',
      userAgent: req.get('User-Agent') || '',
      details: {
        payoutEnabled: newPermission,
        reason: req.body.reason || 'Admin permission update',
      },
    });

    return res.status(200).json({
      success: true,
      message: `Payouts successfully ${newPermission ? 'enabled' : 'disabled'} for Trader ${trader.username}.`,
      trader: {
        id: trader._id,
        username: trader.username,
        fullName: trader.fullName || '',
        status: trader.status,
        payoutEnabled: trader.payoutEnabled,
      },
    });
  } catch (error) {
    console.error('[adminUpdateTraderPayoutSettings Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to update trader payout permission.',
    });
  }
};

// Legacy / Client Self-Request (Preserved for compatibility)
const createPayout = async (req, res) => {
  const { amount, currency = 'INR', accountHolder, accountNumber, ifscOrUpi, walletAddress } = req.body;
  const numAmount = parseFloat(amount);

  if (!numAmount || numAmount <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a valid payout amount greater than zero.',
    });
  }

  if (!accountHolder || accountHolder.trim().length < 2) {
    return res.status(400).json({
      success: false,
      message: 'Recipient account holder name is required.',
    });
  }

  const cleanCurrency = currency.toUpperCase();
  if (!['INR', 'USDT'].includes(cleanCurrency)) {
    return res.status(400).json({
      success: false,
      message: "Supported currencies are 'INR' and 'USDT'.",
    });
  }

  try {
    const availableBalance = await BalanceLedger.calculateAvailableBalance(req.user._id, cleanCurrency);
    if (availableBalance < numAmount) {
      return res.status(400).json({
        success: false,
        message: `Insufficient verified balance. Available: ${cleanCurrency} ${availableBalance}, Requested: ${cleanCurrency} ${numAmount}`,
      });
    }

    const requestId = generateRequestId();

    const payout = new PayoutRequest({
      requestId,
      userId: req.user._id,
      clientId: req.user.username,
      amount: Number(numAmount.toFixed(2)),
      currency: cleanCurrency,
      recipientDetails: {
        accountHolder: accountHolder.trim(),
        accountNumberMasked: accountNumber ? maskAccount(accountNumber) : '',
        ifscOrUpi: ifscOrUpi ? ifscOrUpi.trim() : '',
        walletAddressMasked: walletAddress ? maskAccount(walletAddress) : '',
      },
      status: 'PENDING',
    });

    await payout.save();

    await AuditLog.log({
      action: 'PAYOUT_REQUEST_CREATED',
      user: req.user,
      ipAddress: req.ip || '',
      userAgent: req.get('User-Agent') || '',
      details: { requestId, amount: payout.amount, currency: payout.currency },
    });

    return res.status(201).json({
      success: true,
      message: 'Payout request submitted successfully for administrative review.',
      payout,
    });
  } catch (error) {
    console.error('[Create Payout Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to create payout request.',
    });
  }
};

const getMyPayouts = getTraderPayoutHistory;

module.exports = {
  // Trader methods
  getTraderPayoutSettings,
  getTraderActivePayout,
  getTraderPayoutHistory,
  claimTraderPayout,
  exportTraderPayoutHistoryCsv,
  // Admin methods
  getAllPayoutsAdmin,
  getAdminPayoutById,
  adminAssignPayout,
  adminReviewPayout,
  adminGetTraderPayoutSettings,
  adminUpdateTraderPayoutSettings,
  // Legacy / fallback
  createPayout,
  getMyPayouts,
};
