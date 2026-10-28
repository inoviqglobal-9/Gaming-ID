const crypto = require('crypto');
const mongoose = require('mongoose');
const UsdtWallet = require('../models/UsdtWallet');
const WalletAdjustment = require('../models/WalletAdjustment');
const BalanceLedger = require('../models/BalanceLedger');
const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');
const User = require('../models/User');
const DepositRequest = require('../models/DepositRequest');
const { config } = require('../config/env');

const FIXED_RATE = 105.0;

// Helper to generate unique adjustment ID
const generateAdjustmentId = () => {
  return `ADJ-${Date.now().toString().slice(-6)}-${crypto.randomInt(1000, 9999)}`;
};

// ==========================================
// TRADER WALLET CONTROLLERS
// ==========================================

// GET /api/trader/wallet/usdt
const getTraderUsdtWallet = async (req, res) => {
  try {
    const userId = req.user._id;
    // Always sync with BalanceLedger to reflect any recently confirmed deposits
    const wallet = await UsdtWallet.syncWithLedger(userId);
    const valuation = wallet.toValuation(config.usdtInrRate || FIXED_RATE);

    return res.status(200).json(valuation);
  } catch (error) {
    console.error('[getTraderUsdtWallet Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve USDT wallet.',
    });
  }
};

// GET /api/trader/wallet/transactions
const getTraderUsdtTransactions = async (req, res) => {
  try {
    const userId = req.user._id;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const query = { userId, currency: 'USDT' };
    const [total, entries] = await Promise.all([
      BalanceLedger.countDocuments(query),
      BalanceLedger.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    const transactions = entries.map((e) => {
      const isCredit = e.amount > 0;
      const rate = config.usdtInrRate || FIXED_RATE;
      return {
        id: e._id,
        entryType: e.entryType,
        type: isCredit ? 'CREDIT' : 'DEBIT',
        amount: Math.abs(e.amount).toFixed(6),
        amountDisplay: `${isCredit ? '+' : '-'}${Math.abs(e.amount).toFixed(2)} USDT`,
        currency: 'USDT',
        balanceAfter: (e.balanceAfter || 0).toFixed(6),
        inrEquivalent: ((e.balanceAfter || 0) * rate).toFixed(2),
        referenceRequestId: e.referenceRequestId,
        notes: e.notes || '',
        createdAt: e.createdAt,
      };
    });

    return res.status(200).json({
      success: true,
      data: transactions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    console.error('[getTraderUsdtTransactions Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve USDT transactions.',
    });
  }
};

// ==========================================
// ADMIN WALLET & ADJUSTMENT CONTROLLERS
// ==========================================

// GET /api/admin/traders/:id/wallet/usdt
const getAdminTraderUsdtWallet = async (req, res) => {
  try {
    const { id } = req.params;
    const trader = await User.findById(id);
    if (!trader) {
      return res.status(404).json({
        success: false,
        message: 'Trader not found.',
      });
    }

    const wallet = await UsdtWallet.syncWithLedger(trader._id);
    const valuation = wallet.toValuation(config.usdtInrRate || FIXED_RATE);

    return res.status(200).json({
      ...valuation,
      trader: {
        id: trader._id,
        username: trader.username,
        fullName: trader.fullName || '',
        status: trader.status,
        role: trader.role,
        email: trader.email || '',
        createdAt: trader.createdAt,
      },
    });
  } catch (error) {
    console.error('[getAdminTraderUsdtWallet Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve trader USDT wallet.',
    });
  }
};

// GET /api/admin/traders/:id/transactions
const getAdminTraderTransactions = async (req, res) => {
  try {
    const { id } = req.params;
    const trader = await User.findById(id);
    if (!trader) {
      return res.status(404).json({
        success: false,
        message: 'Trader not found.',
      });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const query = { userId: trader._id, currency: 'USDT' };
    const [total, entries] = await Promise.all([
      BalanceLedger.countDocuments(query),
      BalanceLedger.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('performedBy', 'username role')
        .lean(),
    ]);

    const rate = config.usdtInrRate || FIXED_RATE;
    const transactions = entries.map((e) => {
      const isCredit = e.amount > 0;
      return {
        id: e._id,
        entryType: e.entryType,
        type: isCredit ? 'CREDIT' : 'DEBIT',
        amount: Math.abs(e.amount).toFixed(6),
        amountDisplay: `${isCredit ? '+' : '-'}${Math.abs(e.amount).toFixed(2)} USDT`,
        currency: 'USDT',
        balanceAfter: (e.balanceAfter || 0).toFixed(6),
        inrEquivalent: ((e.balanceAfter || 0) * rate).toFixed(2),
        referenceRequestId: e.referenceRequestId,
        notes: e.notes || '',
        performedBy: e.performedBy ? e.performedBy.username : 'SYSTEM',
        createdAt: e.createdAt,
      };
    });

    return res.status(200).json({
      success: true,
      data: transactions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    console.error('[getAdminTraderTransactions Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve trader transaction history.',
    });
  }
};

// POST /api/admin/wallet-adjustments
const createWalletAdjustment = async (req, res) => {
  const { traderId, type, amount, reason, referenceId } = req.body;

  if (!traderId) {
    return res.status(400).json({
      success: false,
      message: 'Trader ID is required.',
    });
  }

  if (!['CREDIT', 'DEBIT'].includes(type)) {
    return res.status(400).json({
      success: false,
      message: "Adjustment type must be 'CREDIT' or 'DEBIT'.",
    });
  }

  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Adjustment amount must be a valid positive number.',
    });
  }

  if (!reason || reason.trim().length < 3) {
    return res.status(400).json({
      success: false,
      message: 'A mandatory adjustment reason (minimum 3 characters) is required.',
    });
  }

  if (!referenceId || referenceId.trim().length < 3) {
    return res.status(400).json({
      success: false,
      message: 'A mandatory supporting transaction or reference ID (minimum 3 characters) is required.',
    });
  }

  try {
    const trader = await User.findById(traderId);
    if (!trader) {
      return res.status(404).json({
        success: false,
        message: 'Trader not found.',
      });
    }

    if (trader.status !== 'ACTIVE') {
      return res.status(400).json({
        success: false,
        message: `Trader account is ${trader.status}. Adjustments are prohibited.`,
      });
    }

    // Check duplicate referenceId
    const existingAdj = await WalletAdjustment.findOne({
      referenceId: referenceId.trim(),
      status: { $in: ['PENDING', 'APPROVED'] },
    });
    if (existingAdj) {
      return res.status(400).json({
        success: false,
        message: `An adjustment with reference ID '${referenceId.trim()}' already exists with status '${existingAdj.status}'.`,
      });
    }

    // Fetch wallet and check balance if DEBIT
    const wallet = await UsdtWallet.syncWithLedger(trader._id);
    const curAvail = parseFloat(wallet.availableBalance.toString()) || 0;

    if (type === 'DEBIT' && curAvail < numAmount) {
      return res.status(400).json({
        success: false,
        message: `Insufficient available USDT balance. Current: ${curAvail.toFixed(6)} USDT, Requested debit: ${numAmount.toFixed(6)} USDT`,
      });
    }

    const rate = config.usdtInrRate || FIXED_RATE;
    const adjustmentId = generateAdjustmentId();

    const adjustment = new WalletAdjustment({
      adjustmentId,
      traderId: trader._id,
      clientId: trader.username,
      type,
      amount: numAmount,
      currency: 'USDT',
      reason: reason.trim(),
      referenceId: referenceId.trim(),
      status: 'PENDING',
      requestedBy: req.user._id,
      balanceBefore: curAvail,
      rateUsed: rate,
      inrEquivalent: Number((numAmount * rate).toFixed(2)),
      auditHistory: [
        {
          action: 'ADJUSTMENT_REQUESTED',
          performedBy: req.user._id,
          timestamp: new Date(),
          notes: `Requested ${type} of ${numAmount} USDT: ${reason.trim()}`,
        },
      ],
    });

    await adjustment.save();

    await AuditLog.log({
      action: `USDT_WALLET_${type}_REQUESTED`,
      user: req.user,
      targetUserId: trader._id,
      targetUsername: trader.username,
      ipAddress: req.ip || '',
      userAgent: req.get('User-Agent') || '',
      details: {
        adjustmentId,
        type,
        amount: numAmount,
        reason: reason.trim(),
        referenceId: referenceId.trim(),
      },
    });

    return res.status(201).json({
      success: true,
      message: `USDT ${type.toLowerCase()} request created with PENDING status. Requires authorized approval.`,
      data: adjustment,
    });
  } catch (error) {
    console.error('[createWalletAdjustment Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to create wallet adjustment request.',
    });
  }
};

// GET /api/admin/wallet-adjustments
const getWalletAdjustments = async (req, res) => {
  try {
    const { traderId, status } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const filter = {};
    if (traderId) filter.traderId = traderId;
    if (status) filter.status = status;

    const [total, adjustments] = await Promise.all([
      WalletAdjustment.countDocuments(filter),
      WalletAdjustment.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('requestedBy', 'username role')
        .populate('approvedBy', 'username role')
        .lean(),
    ]);

    return res.status(200).json({
      success: true,
      data: adjustments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    console.error('[getWalletAdjustments Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve wallet adjustments.',
    });
  }
};

// POST /api/admin/wallet-adjustments/:id/approve
const approveWalletAdjustment = async (req, res) => {
  const { id } = req.params;
  const { decisionNotes = '' } = req.body;

  try {
    const adjustment = await WalletAdjustment.findOne({
      $or: [
        { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null },
        { adjustmentId: id },
      ].filter(Boolean),
    });

    if (!adjustment) {
      return res.status(404).json({
        success: false,
        message: 'Wallet adjustment not found.',
      });
    }

    if (adjustment.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        message: `Adjustment is already ${adjustment.status}. Cannot approve again.`,
      });
    }

    // Check independent approval rule:
    // If multiple active admins exist, the approver must not be the requester.
    const activeAdminCount = await User.countDocuments({ role: 'ADMIN', status: 'ACTIVE' });
    if (activeAdminCount > 1 && req.user._id.equals(adjustment.requestedBy)) {
      return res.status(403).json({
        success: false,
        message: 'Independent approval policy: An adjustment must be approved by an administrator different from the requester.',
      });
    }

    const trader = await User.findById(adjustment.traderId);
    if (!trader) {
      return res.status(404).json({
        success: false,
        message: 'Target trader not found.',
      });
    }

    let updatedWallet;
    if (adjustment.type === 'CREDIT') {
      updatedWallet = await UsdtWallet.creditWallet({
        traderId: adjustment.traderId,
        clientId: adjustment.clientId,
        amount: adjustment.amount,
        referenceRequestId: adjustment.adjustmentId,
        notes: `Admin adjustment approved: ${adjustment.reason}. Ref: ${adjustment.referenceId}`,
        performedBy: req.user._id,
      });
    } else if (adjustment.type === 'DEBIT') {
      updatedWallet = await UsdtWallet.debitWallet({
        traderId: adjustment.traderId,
        clientId: adjustment.clientId,
        amount: adjustment.amount,
        referenceRequestId: adjustment.adjustmentId,
        notes: `Admin adjustment deduction: ${adjustment.reason}. Ref: ${adjustment.referenceId}`,
        performedBy: req.user._id,
      });
    }

    const newAvail = parseFloat(updatedWallet.availableBalance.toString()) || 0;
    const rate = config.usdtInrRate || FIXED_RATE;

    adjustment.status = 'APPROVED';
    adjustment.approvedBy = req.user._id;
    adjustment.approvedAt = new Date();
    adjustment.balanceAfter = newAvail;
    adjustment.inrEquivalent = Number((newAvail * rate).toFixed(2));
    adjustment.auditHistory.push({
      action: 'ADJUSTMENT_APPROVED',
      performedBy: req.user._id,
      timestamp: new Date(),
      notes: decisionNotes || `Approved ${adjustment.type} of ${adjustment.amount} USDT`,
    });

    await adjustment.save();

    // Log security audit trail
    await AuditLog.log({
      action: `USDT_WALLET_${adjustment.type}_APPROVED`,
      user: req.user,
      targetUserId: trader._id,
      targetUsername: trader.username,
      ipAddress: req.ip || '',
      userAgent: req.get('User-Agent') || '',
      details: {
        adjustmentId: adjustment.adjustmentId,
        type: adjustment.type,
        amount: adjustment.amount,
        newBalance: newAvail,
        referenceId: adjustment.referenceId,
      },
    });

    // Send notifications to trader
    const isCredit = adjustment.type === 'CREDIT';
    await Notification.sendNotification({
      recipientUserId: trader._id,
      recipientClientId: trader.username,
      type: isCredit ? 'USDT_CREDITED' : 'USDT_DEBITED',
      title: isCredit ? 'USDT Balance Credited' : 'USDT Balance Debited',
      message: isCredit
        ? `Your USDT wallet has been credited with ${adjustment.amount.toFixed(2)} USDT (₹${(adjustment.amount * rate).toLocaleString('en-IN', { minimumFractionDigits: 2 })}). Reference: ${adjustment.referenceId}.`
        : `Your USDT wallet has been debited by ${adjustment.amount.toFixed(2)} USDT. Reason: ${adjustment.reason}.`,
      paymentId: adjustment.adjustmentId,
      amount: adjustment.amount,
      currency: 'USDT',
      referenceId: adjustment.referenceId,
    });

    return res.status(200).json({
      success: true,
      message: `USDT adjustment approved and committed. New balance: ${newAvail.toFixed(2)} USDT.`,
      data: {
        adjustment,
        wallet: updatedWallet.toValuation(rate),
      },
    });
  } catch (error) {
    console.error('[approveWalletAdjustment Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to approve wallet adjustment.',
    });
  }
};

// POST /api/admin/wallet-adjustments/:id/reject
const rejectWalletAdjustment = async (req, res) => {
  const { id } = req.params;
  const { reason = '' } = req.body;

  if (!reason || reason.trim().length < 3) {
    return res.status(400).json({
      success: false,
      message: 'A rejection reason (minimum 3 characters) is mandatory.',
    });
  }

  try {
    const adjustment = await WalletAdjustment.findOne({
      $or: [
        { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null },
        { adjustmentId: id },
      ].filter(Boolean),
    });

    if (!adjustment) {
      return res.status(404).json({
        success: false,
        message: 'Wallet adjustment not found.',
      });
    }

    if (adjustment.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        message: `Adjustment is already ${adjustment.status}. Cannot reject.`,
      });
    }

    adjustment.status = 'REJECTED';
    adjustment.rejectionReason = reason.trim();
    adjustment.rejectedAt = new Date();
    adjustment.auditHistory.push({
      action: 'ADJUSTMENT_REJECTED',
      performedBy: req.user._id,
      timestamp: new Date(),
      notes: reason.trim(),
    });

    await adjustment.save();

    await AuditLog.log({
      action: `USDT_WALLET_ADJUSTMENT_REJECTED`,
      user: req.user,
      targetUserId: adjustment.traderId,
      targetUsername: adjustment.clientId,
      ipAddress: req.ip || '',
      userAgent: req.get('User-Agent') || '',
      details: {
        adjustmentId: adjustment.adjustmentId,
        reason: reason.trim(),
      },
    });

    await Notification.sendNotification({
      recipientUserId: adjustment.traderId,
      recipientClientId: adjustment.clientId,
      type: 'ADJUSTMENT_REJECTED',
      title: 'USDT Adjustment Request Rejected',
      message: `The pending adjustment ${adjustment.adjustmentId} (${adjustment.amount} USDT) was rejected. Reason: ${reason.trim()}`,
      paymentId: adjustment.adjustmentId,
      amount: adjustment.amount,
      currency: 'USDT',
    });

    return res.status(200).json({
      success: true,
      message: 'Wallet adjustment rejected successfully.',
      data: adjustment,
    });
  } catch (error) {
    console.error('[rejectWalletAdjustment Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to reject wallet adjustment.',
    });
  }
};

// GET /api/admin/activities (PHASE 10 & PHASE 13)
const getAdminActivities = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;
    const { traderId, action, search } = req.query;

    const filter = {};
    if (traderId) {
      filter.$or = [
        { targetUserId: traderId },
        { performedByUserId: traderId },
      ];
    }
    if (action) {
      filter.action = action;
    }
    if (search) {
      filter.$or = [
        { performedByUsername: { $regex: search, $options: 'i' } },
        { targetUsername: { $regex: search, $options: 'i' } },
        { action: { $regex: search, $options: 'i' } },
      ];
    }

    const [total, logs] = await Promise.all([
      AuditLog.countDocuments(filter),
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    const formattedActivities = logs.map((log) => {
      // Build human-readable descriptions
      let description = log.action;
      if (log.action === 'USER_LOGIN') description = `${log.performedByUsername} logged into platform`;
      else if (log.action === 'FAILED_LOGIN_ATTEMPT') description = `Failed login attempt for ${log.targetUsername || 'unknown user'}`;
      else if (log.action === 'DEPOSIT_CONFIRMED_CREDITED') description = `Deposit request ${log.details?.requestId || ''} approved for ${log.targetUsername}`;
      else if (log.action === 'DEPOSIT_REJECTED') description = `Deposit request rejected for ${log.targetUsername}`;
      else if (log.action === 'USDT_WALLET_CREDIT_REQUESTED') description = `USDT Credit of ${log.details?.amount || 0} requested for ${log.targetUsername}`;
      else if (log.action === 'USDT_WALLET_CREDIT_APPROVED') description = `USDT Credit of ${log.details?.amount || 0} approved for ${log.targetUsername}`;
      else if (log.action === 'USDT_WALLET_DEBIT_APPROVED') description = `USDT Debit of ${log.details?.amount || 0} approved for ${log.targetUsername}`;

      return {
        activityId: log._id,
        traderId: log.targetUserId || log.performedByUserId,
        eventType: log.action,
        actorRole: log.role || 'ADMIN',
        actorId: log.performedByUserId,
        actorUsername: log.performedByUsername,
        targetUsername: log.targetUsername,
        ipAddress: log.ipAddress,
        timestamp: log.createdAt,
        description,
        details: log.details || {},
      };
    });

    return res.status(200).json({
      success: true,
      data: formattedActivities,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    console.error('[getAdminActivities Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve administrative activity log.',
    });
  }
};

module.exports = {
  getTraderUsdtWallet,
  getTraderUsdtTransactions,
  getAdminTraderUsdtWallet,
  getAdminTraderTransactions,
  createWalletAdjustment,
  getWalletAdjustments,
  approveWalletAdjustment,
  rejectWalletAdjustment,
  getAdminActivities,
};
