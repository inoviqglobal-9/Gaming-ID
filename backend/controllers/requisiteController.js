const crypto = require('crypto');
const Requisite = require('../models/Requisite');
const RequisiteConfig = require('../models/RequisiteConfig');
const PayInRequest = require('../models/PayInRequest');
const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');
const User = require('../models/User');

// Generate unique 5-digit numeric Requisite ID (e.g. 19138, 18939)
const generateRequisiteId = async () => {
  for (let i = 0; i < 10; i++) {
    const candidate = crypto.randomInt(10000, 99999).toString();
    const existing = await Requisite.findOne({ requisiteId: candidate });
    if (!existing) return candidate;
  }
  return (Date.now() % 90000 + 10000).toString();
};

// Calculate start of today in Asia/Kolkata timezone
const getStartOfTodayIST = () => {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(now.getTime() + istOffset);
  istDate.setUTCHours(0, 0, 0, 0);
  return new Date(istDate.getTime() - istOffset);
};

// Compute today's verified transaction statistics for a requisite
const computeRequisiteTodayStats = async (reqDoc) => {
  try {
    const startOfToday = getStartOfTodayIST();
    const query = {
      $and: [
        {
          $or: [
            { requisiteId: reqDoc.requisiteId },
            { requisite: { $regex: reqDoc.accountHolderName, $options: 'i' } },
            reqDoc.upiId ? { requisite: { $regex: reqDoc.upiId, $options: 'i' } } : null,
          ].filter(Boolean),
        },
        { status: { $in: ['CONFIRMED', 'VERIFIED'] } },
        { createdAt: { $gte: startOfToday } },
      ],
    };

    const txs = await PayInRequest.find(query).select('amount createdAt').lean();
    const txCount = txs.length;
    const verifiedAmount = txs.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    return {
      todayTxCount: txCount,
      todayVerifiedAmount: verifiedAmount,
      usedToday: Math.min(verifiedAmount, reqDoc.dailyLimit),
    };
  } catch (err) {
    return {
      todayTxCount: 0,
      todayVerifiedAmount: 0,
      usedToday: 0,
    };
  }
};

// Format Requisite Document for API response
const formatRequisiteDoc = (doc, stats = null) => {
  const accountOrUpi =
    doc.type === 'UPI'
      ? doc.upiId || '-'
      : doc.accountNumberLast4
      ? `**** **** ${doc.accountNumberLast4}`
      : doc.accountNumber || '-';

  return {
    _id: doc._id,
    requisiteId: doc.requisiteId,
    type: doc.type,
    accountHolderName: doc.accountHolderName,
    accountOrUpi,
    upiId: doc.upiId || '-',
    accountNumberMasked: doc.accountNumberLast4
      ? `**** **** ${doc.accountNumberLast4}`
      : doc.accountNumber || '-',
    accountNumber: doc.accountNumber || '-',
    ifsc: doc.ifsc || '-',
    bankName: doc.bankName,
    note: doc.note || '-',
    dailyLimit: doc.dailyLimit,
    usedToday: stats ? stats.usedToday : doc.usedToday || 0,
    remainingDailyLimit: Math.max(
      0,
      doc.dailyLimit - (stats ? stats.usedToday : doc.usedToday || 0)
    ),
    minAmount: doc.minAmount,
    maxAmount: doc.maxAmount,
    amountRange:
      doc.minAmount && doc.maxAmount
        ? `₹${doc.minAmount.toLocaleString('en-IN')} - ₹${doc.maxAmount.toLocaleString('en-IN')}`
        : '-',
    todayTxCount: stats ? stats.todayTxCount : 0,
    todayVerifiedAmount: stats ? stats.todayVerifiedAmount : 0,
    status: doc.status,
    approvalStatus: doc.approvalStatus,
    payinEnabled: doc.payinEnabled,
    adminPayinAllowed: doc.adminPayinAllowed !== false,
    rejectionReason: doc.rejectionReason || '',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    trader: doc.userId
      ? {
          _id: doc.userId._id || doc.userId,
          username: doc.userId.username || doc.clientId,
          fullName: doc.userId.fullName || '',
        }
      : {
          username: doc.clientId,
        },
  };
};

// ==========================================
// TRADER CONTROLLERS
// ==========================================

// GET /api/trader/requisites/summary
const getTraderRequisitesSummary = async (req, res) => {
  try {
    const userId = req.user._id;

    const requisites = await Requisite.find({ userId }).lean();
    const totalRequisites = requisites.length;
    const activeRequisites = requisites.filter((r) => r.status === 'ACTIVE');
    const activeCount = activeRequisites.length;
    const totalDailyLimit = activeRequisites.reduce(
      (sum, r) => sum + (Number(r.dailyLimit) || 0),
      0
    );

    return res.status(200).json({
      success: true,
      data: {
        totalRequisites,
        active: activeCount,
        totalDailyLimit,
      },
    });
  } catch (error) {
    console.error('[getTraderRequisitesSummary Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to calculate requisites summary.',
    });
  }
};

// GET /api/trader/requisites
const getTraderRequisites = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      search = '',
      status = 'ALL',
      payin = 'ALL',
      sortBy = 'NEWEST',
      page = 1,
      limit = 50,
    } = req.query;

    const filter = { userId };

    // Status filter
    if (status && status !== 'ALL') {
      filter.status = status.toUpperCase();
    }

    // PayIn filter
    if (payin && payin !== 'ALL') {
      if (payin === 'ON') filter.payinEnabled = true;
      if (payin === 'OFF') filter.payinEnabled = false;
    }

    // Search filter across Account Holder, UPI ID, Requisite ID, Bank Name, Account Number
    if (search.trim()) {
      const q = search.trim();
      filter.$or = [
        { requisiteId: { $regex: q, $options: 'i' } },
        { accountHolderName: { $regex: q, $options: 'i' } },
        { upiId: { $regex: q, $options: 'i' } },
        { bankName: { $regex: q, $options: 'i' } },
        { accountNumber: { $regex: q, $options: 'i' } },
        { ifsc: { $regex: q, $options: 'i' } },
      ];
    }

    // Sorting
    let sortOption = { createdAt: -1 };
    if (sortBy === 'NAME') sortOption = { accountHolderName: 1 };
    else if (sortBy === 'NEWEST') sortOption = { createdAt: -1 };
    else if (sortBy === 'OLDEST') sortOption = { createdAt: 1 };
    else if (sortBy === 'HIGHEST_LIMIT') sortOption = { dailyLimit: -1 };
    else if (sortBy === 'LOWEST_LIMIT') sortOption = { dailyLimit: 1 };

    const skip = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
    const total = await Requisite.countDocuments(filter);
    const rawDocs = await Requisite.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit, 10));

    // Calculate real IST statistics for each requisite
    const formattedDocs = await Promise.all(
      rawDocs.map(async (doc) => {
        const stats = await computeRequisiteTodayStats(doc);
        return formatRequisiteDoc(doc, stats);
      })
    );

    return res.status(200).json({
      success: true,
      data: formattedDocs,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        totalPages: Math.ceil(total / parseInt(limit, 10)) || 1,
      },
    });
  } catch (error) {
    console.error('[getTraderRequisites Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve requisites.',
    });
  }
};

// POST /api/trader/requisites
const createTraderRequisite = async (req, res) => {
  try {
    const userId = req.user._id;
    const clientId = req.user.username;
    const {
      type = 'UPI',
      accountHolderName,
      upiId,
      bankName,
      accountNumber,
      confirmAccountNumber,
      ifsc,
      dailyLimit,
      note,
    } = req.body;

    const config = await RequisiteConfig.getOrCreateDefault();

    // 1. Validate Type
    const cleanType = (type || 'UPI').toUpperCase();
    if (!['UPI', 'IMPS'].includes(cleanType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid requisite type. Supported types are UPI and IMPS (BANK TRANSFER).',
      });
    }

    if (cleanType === 'UPI' && config.upiEnabled === false) {
      return res.status(400).json({
        success: false,
        message: 'UPI requisites are currently disabled by administrator.',
      });
    }

    if (cleanType === 'IMPS' && config.impsEnabled === false) {
      return res.status(400).json({
        success: false,
        message: 'IMPS requisites are currently disabled by administrator.',
      });
    }

    // 2. Validate Requisite count limit per trader
    const currentCount = await Requisite.countDocuments({ userId });
    if (currentCount >= (config.maxRequisitesPerTrader || 20)) {
      return res.status(400).json({
        success: false,
        message: `Maximum allowed requisites (${config.maxRequisitesPerTrader || 20}) reached.`,
      });
    }

    // 3. Validate Common Fields
    if (!accountHolderName || !accountHolderName.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Account Holder Name is required.',
      });
    }

    if (!bankName || !bankName.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Bank Name is required.',
      });
    }

    const numLimit = parseFloat(dailyLimit);
    if (isNaN(numLimit) || numLimit <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid positive daily limit.',
      });
    }

    const maxAllowedLimit = config.maxDailyLimit || 5000000;
    if (numLimit > maxAllowedLimit) {
      return res.status(400).json({
        success: false,
        message: `Daily limit cannot exceed ₹${maxAllowedLimit.toLocaleString('en-IN')}.`,
      });
    }

    let cleanUpi = null;
    let cleanAcc = null;
    let cleanIfsc = null;

    // 4. Type Specific Validation
    if (cleanType === 'UPI') {
      if (!upiId || !upiId.trim()) {
        return res.status(400).json({
          success: false,
          message: 'UPI ID is required for UPI requisite.',
        });
      }
      cleanUpi = upiId.trim().toLowerCase();
      // UPI format validation
      const upiRegex = /^[\w.-]+@[\w.-]+$/;
      if (!upiRegex.test(cleanUpi)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid UPI ID format. E.g. phonenumber@paytm, name@oksbi.',
        });
      }

      // Check duplicate UPI for this trader
      const dupUpi = await Requisite.findOne({ userId, upiId: cleanUpi });
      if (dupUpi) {
        return res.status(400).json({
          success: false,
          message: 'This UPI ID is already registered in your requisites.',
        });
      }
    } else {
      // IMPS validation
      if (!accountNumber || !accountNumber.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Account Number is required for IMPS.',
        });
      }
      if (accountNumber.trim() !== (confirmAccountNumber || '').trim()) {
        return res.status(400).json({
          success: false,
          message: 'Account Number and Confirm Account Number do not match.',
        });
      }
      cleanAcc = accountNumber.trim();
      if (!/^\d{6,24}$/.test(cleanAcc)) {
        return res.status(400).json({
          success: false,
          message: 'Bank account number must be between 6 and 24 digits.',
        });
      }

      if (!ifsc || !ifsc.trim()) {
        return res.status(400).json({
          success: false,
          message: 'IFSC Code is required for IMPS.',
        });
      }
      cleanIfsc = ifsc.trim().toUpperCase();
      const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
      if (!ifscRegex.test(cleanIfsc)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid IFSC Code format. Example: HDFC0001234 or SBIN0000456.',
        });
      }

      // Check duplicate account number for this trader
      const dupAcc = await Requisite.findOne({ userId, accountNumber: cleanAcc });
      if (dupAcc) {
        return res.status(400).json({
          success: false,
          message: 'This Account Number is already registered in your requisites.',
        });
      }
    }

    // 5. Generate unique Requisite ID
    const requisiteId = await generateRequisiteId();

    const isAutoApproved = config.autoApprove === true;
    const initialStatus = isAutoApproved ? 'ACTIVE' : 'INACTIVE';
    const initialApproval = isAutoApproved ? 'APPROVED' : 'PENDING_REVIEW';

    const newRequisite = await Requisite.create({
      requisiteId,
      userId,
      clientId,
      type: cleanType,
      accountHolderName: accountHolderName.trim(),
      upiId: cleanUpi,
      bankName: bankName.trim(),
      accountNumber: cleanAcc,
      ifsc: cleanIfsc,
      dailyLimit: numLimit,
      minAmount: config.minTransactionAmount || 100,
      maxAmount: config.maxTransactionAmount || 50000,
      note: (note || '').trim(),
      status: initialStatus,
      approvalStatus: initialApproval,
      payinEnabled: false, // PayIn is strictly OFF by default
      adminPayinAllowed: true,
      auditHistory: [
        {
          action: 'REQUISITE_CREATED',
          performedBy: userId,
          timestamp: new Date(),
          notes: `Created ${cleanType} requisite ${requisiteId}`,
          previousStatus: '',
          newStatus: initialStatus,
        },
      ],
    });

    await AuditLog.log({
      action: 'REQUISITE_CREATED',
      user: req.user,
      ipAddress: req.ip || '',
      userAgent: req.get('User-Agent') || '',
      details: {
        requisiteId,
        type: cleanType,
        accountHolderName: newRequisite.accountHolderName,
        dailyLimit: numLimit,
      },
    });

    return res.status(201).json({
      success: true,
      message: isAutoApproved
        ? 'Requisite created and approved successfully.'
        : 'Requisite created successfully. Waiting for administrator approval.',
      data: formatRequisiteDoc(newRequisite),
    });
  } catch (error) {
    console.error('[createTraderRequisite Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to create requisite.',
    });
  }
};

// GET /api/trader/requisites/:id
const getTraderRequisiteById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const requisite = await Requisite.findOne({
      $and: [
        { userId },
        {
          $or: [
            { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null },
            { requisiteId: id },
          ].filter(Boolean),
        },
      ],
    });

    if (!requisite) {
      return res.status(404).json({
        success: false,
        message: 'Requisite not found or access unauthorized.',
      });
    }

    const stats = await computeRequisiteTodayStats(requisite);
    return res.status(200).json({
      success: true,
      data: formatRequisiteDoc(requisite, stats),
    });
  } catch (error) {
    console.error('[getTraderRequisiteById Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch requisite details.',
    });
  }
};

// PATCH /api/trader/requisites/:id
const updateTraderRequisite = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const { note, accountHolderName, bankName } = req.body;

    const requisite = await Requisite.findOne({
      $and: [
        { userId },
        {
          $or: [
            { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null },
            { requisiteId: id },
          ].filter(Boolean),
        },
      ],
    });

    if (!requisite) {
      return res.status(404).json({
        success: false,
        message: 'Requisite not found or access unauthorized.',
      });
    }

    if (note !== undefined) requisite.note = (note || '').trim();
    if (accountHolderName && accountHolderName.trim()) {
      requisite.accountHolderName = accountHolderName.trim();
    }
    if (bankName && bankName.trim()) {
      requisite.bankName = bankName.trim();
    }

    requisite.auditHistory.push({
      action: 'REQUISITE_UPDATED_BY_TRADER',
      performedBy: userId,
      timestamp: new Date(),
      notes: 'Trader updated requisite details',
      previousStatus: requisite.status,
      newStatus: requisite.status,
    });

    await requisite.save();

    const stats = await computeRequisiteTodayStats(requisite);
    return res.status(200).json({
      success: true,
      message: 'Requisite updated successfully.',
      data: formatRequisiteDoc(requisite, stats),
    });
  } catch (error) {
    console.error('[updateTraderRequisite Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to update requisite.',
    });
  }
};

// PATCH /api/trader/requisites/:id/payin (Task 12: PayIn Toggle Functionality)
const toggleTraderPayIn = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const { payinEnabled } = req.body;

    const requisite = await Requisite.findOne({
      $and: [
        { userId },
        {
          $or: [
            { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null },
            { requisiteId: id },
          ].filter(Boolean),
        },
      ],
    });

    if (!requisite) {
      return res.status(404).json({
        success: false,
        message: 'Requisite not found or access unauthorized.',
      });
    }

    const targetPayin = Boolean(payinEnabled);

    // CRITICAL ENFORCEMENT: PayIn ON requires Active status & Admin approval
    if (targetPayin === true) {
      if (requisite.status !== 'ACTIVE') {
        return res.status(400).json({
          success: false,
          message:
            'Cannot enable PayIn on an inactive requisite. Requisite must be activated by administrator first.',
        });
      }
      if (requisite.approvalStatus !== 'APPROVED') {
        return res.status(400).json({
          success: false,
          message:
            'Cannot enable PayIn on an unapproved requisite. Pending administrator approval.',
        });
      }
      if (requisite.adminPayinAllowed === false) {
        return res.status(400).json({
          success: false,
          message: 'PayIn receiving is disabled for this requisite by administrator.',
        });
      }
    }

    requisite.payinEnabled = targetPayin;
    requisite.auditHistory.push({
      action: targetPayin ? 'PAYIN_ENABLED' : 'PAYIN_DISABLED',
      performedBy: userId,
      timestamp: new Date(),
      notes: `Trader toggled PayIn to ${targetPayin ? 'ON' : 'OFF'}`,
      previousStatus: requisite.status,
      newStatus: requisite.status,
    });

    await requisite.save();

    await AuditLog.log({
      action: targetPayin ? 'REQUISITE_PAYIN_ENABLED' : 'REQUISITE_PAYIN_DISABLED',
      user: req.user,
      ipAddress: req.ip || '',
      userAgent: req.get('User-Agent') || '',
      details: {
        requisiteId: requisite.requisiteId,
        payinEnabled: targetPayin,
      },
    });

    const stats = await computeRequisiteTodayStats(requisite);
    return res.status(200).json({
      success: true,
      message: `PayIn receiving turned ${targetPayin ? 'ON' : 'OFF'} successfully.`,
      data: formatRequisiteDoc(requisite, stats),
    });
  } catch (error) {
    console.error('[toggleTraderPayIn Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to toggle PayIn.',
    });
  }
};

// GET /api/trader/requisites/:id/statistics (Task 14: Requisite Statistics)
const getTraderRequisiteStatistics = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const requisite = await Requisite.findOne({
      $and: [
        { userId },
        {
          $or: [
            { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null },
            { requisiteId: id },
          ].filter(Boolean),
        },
      ],
    });

    if (!requisite) {
      return res.status(404).json({
        success: false,
        message: 'Requisite not found or access unauthorized.',
      });
    }

    const startOfToday = getStartOfTodayIST();
    const query = {
      $and: [
        {
          $or: [
            { requisiteId: requisite.requisiteId },
            { requisite: { $regex: requisite.accountHolderName, $options: 'i' } },
            requisite.upiId ? { requisite: { $regex: requisite.upiId, $options: 'i' } } : null,
          ].filter(Boolean),
        },
      ],
    };

    const recentTxs = await PayInRequest.find(query)
      .sort({ createdAt: -1 })
      .limit(10)
      .select('orderId amount currency status utr createdAt')
      .lean();

    const confirmedTxsToday = recentTxs.filter(
      (t) => ['CONFIRMED', 'VERIFIED'].includes(t.status) && new Date(t.createdAt) >= startOfToday
    );

    const todayVerifiedAmount = confirmedTxsToday.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const usedToday = Math.min(todayVerifiedAmount, requisite.dailyLimit);
    const remainingLimit = Math.max(0, requisite.dailyLimit - usedToday);

    return res.status(200).json({
      success: true,
      data: {
        requisiteId: requisite.requisiteId,
        accountHolderName: requisite.accountHolderName,
        type: requisite.type,
        bankName: requisite.bankName,
        status: requisite.status,
        payinEnabled: requisite.payinEnabled,
        dailyLimit: requisite.dailyLimit,
        usedToday,
        remainingDailyLimit: remainingLimit,
        todayTxCount: confirmedTxsToday.length,
        todayVerifiedVolume: todayVerifiedAmount,
        recentTransactions: recentTxs,
      },
    });
  } catch (error) {
    console.error('[getTraderRequisiteStatistics Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch requisite statistics.',
    });
  }
};

// ==========================================
// ADMIN CONTROLLERS
// ==========================================

// GET /api/admin/requisites
const getAllRequisitesAdmin = async (req, res) => {
  try {
    const {
      search = '',
      status = 'ALL',
      type = 'ALL',
      trader = '',
      page = 1,
      limit = 50,
    } = req.query;

    const filter = {};

    if (status && status !== 'ALL') {
      filter.status = status.toUpperCase();
    }
    if (type && type !== 'ALL') {
      filter.type = type.toUpperCase();
    }
    if (trader.trim()) {
      filter.$or = [
        { clientId: { $regex: trader.trim(), $options: 'i' } },
        { accountHolderName: { $regex: trader.trim(), $options: 'i' } },
      ];
    }

    if (search.trim()) {
      const q = search.trim();
      filter.$or = [
        { requisiteId: { $regex: q, $options: 'i' } },
        { clientId: { $regex: q, $options: 'i' } },
        { accountHolderName: { $regex: q, $options: 'i' } },
        { upiId: { $regex: q, $options: 'i' } },
        { bankName: { $regex: q, $options: 'i' } },
        { accountNumber: { $regex: q, $options: 'i' } },
        { ifsc: { $regex: q, $options: 'i' } },
      ];
    }

    const skip = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
    const total = await Requisite.countDocuments(filter);
    const rawDocs = await Requisite.find(filter)
      .populate('userId', 'username fullName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10));

    const formattedDocs = await Promise.all(
      rawDocs.map(async (doc) => {
        const stats = await computeRequisiteTodayStats(doc);
        return formatRequisiteDoc(doc, stats);
      })
    );

    return res.status(200).json({
      success: true,
      data: formattedDocs,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        totalPages: Math.ceil(total / parseInt(limit, 10)) || 1,
      },
    });
  } catch (error) {
    console.error('[getAllRequisitesAdmin Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch admin requisites.',
    });
  }
};

// GET /api/admin/requisites/:id
const getAdminRequisiteById = async (req, res) => {
  try {
    const { id } = req.params;
    const requisite = await Requisite.findOne({
      $or: [
        { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null },
        { requisiteId: id },
      ].filter(Boolean),
    }).populate('userId', 'username fullName email');

    if (!requisite) {
      return res.status(404).json({
        success: false,
        message: 'Requisite not found.',
      });
    }

    const stats = await computeRequisiteTodayStats(requisite);
    return res.status(200).json({
      success: true,
      data: formatRequisiteDoc(requisite, stats),
    });
  } catch (error) {
    console.error('[getAdminRequisiteById Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch requisite details.',
    });
  }
};

// POST /api/admin/requisites/:id/approve
const adminApproveRequisite = async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const requisite = await Requisite.findOne({
      $or: [
        { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null },
        { requisiteId: id },
      ].filter(Boolean),
    });

    if (!requisite) {
      return res.status(404).json({
        success: false,
        message: 'Requisite not found.',
      });
    }

    const prevStatus = requisite.status;
    requisite.approvalStatus = 'APPROVED';
    requisite.status = 'ACTIVE';
    requisite.reviewedBy = req.user._id;
    requisite.reviewedAt = new Date();
    requisite.rejectionReason = '';

    requisite.auditHistory.push({
      action: 'REQUISITE_APPROVED_AND_ACTIVATED',
      performedBy: req.user._id,
      timestamp: new Date(),
      notes: notes || 'Approved and activated by Administrator',
      previousStatus: prevStatus,
      newStatus: 'ACTIVE',
    });

    await requisite.save();

    await AuditLog.log({
      action: 'REQUISITE_APPROVED',
      user: req.user,
      targetUserId: requisite.userId,
      targetUsername: requisite.clientId,
      ipAddress: req.ip || '',
      userAgent: req.get('User-Agent') || '',
      details: {
        requisiteId: requisite.requisiteId,
        type: requisite.type,
      },
    });

    await Notification.sendNotification({
      recipientUserId: requisite.userId,
      recipientClientId: requisite.clientId,
      type: 'SYSTEM',
      title: 'Requisite Approved & Activated',
      message: `Your ${requisite.type} requisite (${requisite.requisiteId} - ${requisite.accountHolderName}) has been approved and activated.`,
    });

    const stats = await computeRequisiteTodayStats(requisite);
    return res.status(200).json({
      success: true,
      message: 'Requisite approved and activated successfully.',
      data: formatRequisiteDoc(requisite, stats),
    });
  } catch (error) {
    console.error('[adminApproveRequisite Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to approve requisite.',
    });
  }
};

// POST /api/admin/requisites/:id/reject
const adminRejectRequisite = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required.',
      });
    }

    const requisite = await Requisite.findOne({
      $or: [
        { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null },
        { requisiteId: id },
      ].filter(Boolean),
    });

    if (!requisite) {
      return res.status(404).json({
        success: false,
        message: 'Requisite not found.',
      });
    }

    const prevStatus = requisite.status;
    requisite.approvalStatus = 'REJECTED';
    requisite.status = 'REJECTED';
    requisite.payinEnabled = false;
    requisite.reviewedBy = req.user._id;
    requisite.reviewedAt = new Date();
    requisite.rejectionReason = reason.trim();

    requisite.auditHistory.push({
      action: 'REQUISITE_REJECTED',
      performedBy: req.user._id,
      timestamp: new Date(),
      notes: reason.trim(),
      previousStatus: prevStatus,
      newStatus: 'REJECTED',
    });

    await requisite.save();

    await AuditLog.log({
      action: 'REQUISITE_REJECTED',
      user: req.user,
      targetUserId: requisite.userId,
      targetUsername: requisite.clientId,
      ipAddress: req.ip || '',
      userAgent: req.get('User-Agent') || '',
      details: {
        requisiteId: requisite.requisiteId,
        reason: reason.trim(),
      },
    });

    await Notification.sendNotification({
      recipientUserId: requisite.userId,
      recipientClientId: requisite.clientId,
      type: 'SYSTEM',
      title: 'Requisite Rejected',
      message: `Your ${requisite.type} requisite (${requisite.requisiteId}) was rejected. Reason: ${reason.trim()}`,
    });

    const stats = await computeRequisiteTodayStats(requisite);
    return res.status(200).json({
      success: true,
      message: 'Requisite rejected.',
      data: formatRequisiteDoc(requisite, stats),
    });
  } catch (error) {
    console.error('[adminRejectRequisite Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to reject requisite.',
    });
  }
};

// PATCH /api/admin/requisites/:id/status
const adminUpdateRequisiteStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const cleanStatus = (status || '').toUpperCase();
    if (!['ACTIVE', 'INACTIVE', 'PENDING_REVIEW', 'REJECTED'].includes(cleanStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value.',
      });
    }

    const requisite = await Requisite.findOne({
      $or: [
        { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null },
        { requisiteId: id },
      ].filter(Boolean),
    });

    if (!requisite) {
      return res.status(404).json({
        success: false,
        message: 'Requisite not found.',
      });
    }

    const prevStatus = requisite.status;
    requisite.status = cleanStatus;
    if (cleanStatus === 'INACTIVE' || cleanStatus === 'REJECTED') {
      requisite.payinEnabled = false; // Turn PayIn OFF if deactivated
    }

    requisite.auditHistory.push({
      action: 'STATUS_CHANGED_BY_ADMIN',
      performedBy: req.user._id,
      timestamp: new Date(),
      notes: `Status changed from ${prevStatus} to ${cleanStatus}`,
      previousStatus: prevStatus,
      newStatus: cleanStatus,
    });

    await requisite.save();

    const stats = await computeRequisiteTodayStats(requisite);
    return res.status(200).json({
      success: true,
      message: `Requisite status updated to ${cleanStatus}.`,
      data: formatRequisiteDoc(requisite, stats),
    });
  } catch (error) {
    console.error('[adminUpdateRequisiteStatus Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to update requisite status.',
    });
  }
};

// PATCH /api/admin/requisites/:id/limits
const adminUpdateRequisiteLimits = async (req, res) => {
  try {
    const { id } = req.params;
    const { dailyLimit, minAmount, maxAmount } = req.body;

    const requisite = await Requisite.findOne({
      $or: [
        { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null },
        { requisiteId: id },
      ].filter(Boolean),
    });

    if (!requisite) {
      return res.status(404).json({
        success: false,
        message: 'Requisite not found.',
      });
    }

    if (dailyLimit !== undefined) {
      const num = parseFloat(dailyLimit);
      if (!isNaN(num) && num > 0) requisite.dailyLimit = num;
    }
    if (minAmount !== undefined) {
      const num = parseFloat(minAmount);
      if (!isNaN(num) && num >= 0) requisite.minAmount = num;
    }
    if (maxAmount !== undefined) {
      const num = parseFloat(maxAmount);
      if (!isNaN(num) && num >= (requisite.minAmount || 0)) requisite.maxAmount = num;
    }

    requisite.auditHistory.push({
      action: 'LIMITS_UPDATED_BY_ADMIN',
      performedBy: req.user._id,
      timestamp: new Date(),
      notes: `Updated daily limit to ${requisite.dailyLimit}, min ${requisite.minAmount}, max ${requisite.maxAmount}`,
      previousStatus: requisite.status,
      newStatus: requisite.status,
    });

    await requisite.save();

    const stats = await computeRequisiteTodayStats(requisite);
    return res.status(200).json({
      success: true,
      message: 'Requisite limits updated successfully.',
      data: formatRequisiteDoc(requisite, stats),
    });
  } catch (error) {
    console.error('[adminUpdateRequisiteLimits Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to update limits.',
    });
  }
};

// PATCH /api/admin/requisites/:id/payin-permission
const adminUpdatePayInPermission = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminPayinAllowed } = req.body;

    const requisite = await Requisite.findOne({
      $or: [
        { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null },
        { requisiteId: id },
      ].filter(Boolean),
    });

    if (!requisite) {
      return res.status(404).json({
        success: false,
        message: 'Requisite not found.',
      });
    }

    const allowed = Boolean(adminPayinAllowed);
    requisite.adminPayinAllowed = allowed;
    if (!allowed) requisite.payinEnabled = false;

    await requisite.save();

    const stats = await computeRequisiteTodayStats(requisite);
    return res.status(200).json({
      success: true,
      message: `PayIn permission ${allowed ? 'granted' : 'revoked'}.`,
      data: formatRequisiteDoc(requisite, stats),
    });
  } catch (error) {
    console.error('[adminUpdatePayInPermission Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to update PayIn permission.',
    });
  }
};

// GET /api/admin/requisite-settings
const getAdminRequisiteSettings = async (req, res) => {
  try {
    const config = await RequisiteConfig.getOrCreateDefault();
    return res.status(200).json({
      success: true,
      data: config,
    });
  } catch (error) {
    console.error('[getAdminRequisiteSettings Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve requisite settings.',
    });
  }
};

// PATCH /api/admin/requisite-settings
const updateAdminRequisiteSettings = async (req, res) => {
  try {
    const {
      upiEnabled,
      impsEnabled,
      maxRequisitesPerTrader,
      defaultDailyLimit,
      maxDailyLimit,
      minTransactionAmount,
      maxTransactionAmount,
      autoApprove,
    } = req.body;

    const config = await RequisiteConfig.getOrCreateDefault();

    if (upiEnabled !== undefined) config.upiEnabled = Boolean(upiEnabled);
    if (impsEnabled !== undefined) config.impsEnabled = Boolean(impsEnabled);
    if (maxRequisitesPerTrader !== undefined) config.maxRequisitesPerTrader = Number(maxRequisitesPerTrader);
    if (defaultDailyLimit !== undefined) config.defaultDailyLimit = Number(defaultDailyLimit);
    if (maxDailyLimit !== undefined) config.maxDailyLimit = Number(maxDailyLimit);
    if (minTransactionAmount !== undefined) config.minTransactionAmount = Number(minTransactionAmount);
    if (maxTransactionAmount !== undefined) config.maxTransactionAmount = Number(maxTransactionAmount);
    if (autoApprove !== undefined) config.autoApprove = Boolean(autoApprove);

    config.updatedBy = req.user._id;
    await config.save();

    return res.status(200).json({
      success: true,
      message: 'Requisite settings updated successfully.',
      data: config,
    });
  } catch (error) {
    console.error('[updateAdminRequisiteSettings Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to update requisite settings.',
    });
  }
};

module.exports = {
  getTraderRequisitesSummary,
  getTraderRequisites,
  createTraderRequisite,
  getTraderRequisiteById,
  updateTraderRequisite,
  toggleTraderPayIn,
  getTraderRequisiteStatistics,
  getAllRequisitesAdmin,
  getAdminRequisiteById,
  adminApproveRequisite,
  adminRejectRequisite,
  adminUpdateRequisiteStatus,
  adminUpdateRequisiteLimits,
  adminUpdatePayInPermission,
  getAdminRequisiteSettings,
  updateAdminRequisiteSettings,
};
