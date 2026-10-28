const crypto = require('crypto');
const PayInRequest = require('../models/PayInRequest');
const BalanceLedger = require('../models/BalanceLedger');
const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');
const User = require('../models/User');

// Helper to escape CSV values and protect against CSV formula injection
const escapeCsvValue = (val) => {
  if (val === null || val === undefined) return '""';
  let str = String(val).trim();
  // CSV Formula Injection mitigation: prepend ' if value starts with dangerous character
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
};

// Map PayIn document into standardized Application structure
const formatApplicationDoc = (doc) => {
  const reqId = doc.requestId || '';
  const fallbackOrder = `ORD-${reqId.replace(/[^0-9]/g, '').slice(-6) || '000000'}-${doc._id.toString().slice(-4)}`;
  return {
    _id: doc._id,
    applicationId: doc.applicationId || doc.requestId,
    orderId: doc.orderId || fallbackOrder,
    utr: doc.utr || doc.referenceId || '-',
    payerName: doc.payerName || doc.clientId || 'Authorized Trader',
    requisite: doc.requisite || doc.merchantName || 'Default Requisite',
    requisiteId: doc.requisiteId || '',
    amount: doc.amount,
    currency: doc.currency || 'INR',
    status: doc.status || 'PENDING',
    paymentProvider: doc.paymentProvider || 'PhonePe Business',
    isDemo: Boolean(doc.isDemo),
    clientNotes: doc.clientNotes || '',
    reviewNotes: doc.adminDecisionNotes || doc.reviewNotes || '',
    statusHistory: doc.statusHistory || [],
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    expiresAt: doc.expiresAt,
    reviewedBy: doc.reviewedBy,
    reviewedAt: doc.reviewedAt,
    trader: doc.userId
      ? {
          _id: doc.userId._id || doc.userId,
          username: doc.userId.username || doc.clientId,
          role: doc.userId.role || 'TRADER',
        }
      : {
          username: doc.clientId,
          role: 'TRADER',
        },
  };
};

// ==========================================
// TRADER APPLICATION CONTROLLERS
// ==========================================

// GET /api/trader/applications
const getTraderApplications = async (req, res) => {
  try {
    const userId = req.user._id;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20)); // Default 20 as requested
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

    const filter = { userId };

    // Application ID filter
    if (req.query.applicationId) {
      const q = req.query.applicationId.trim();
      filter.$or = [
        { applicationId: { $regex: q, $options: 'i' } },
        { requestId: { $regex: q, $options: 'i' } },
      ];
    }

    // Order ID filter
    if (req.query.orderId) {
      filter.orderId = { $regex: req.query.orderId.trim(), $options: 'i' };
    }

    // UTR filter
    if (req.query.utr) {
      const u = req.query.utr.trim();
      filter.$or = [
        { utr: { $regex: u, $options: 'i' } },
        { referenceId: { $regex: u, $options: 'i' } },
      ];
    }

    // Payer Name filter
    if (req.query.payerName) {
      filter.payerName = { $regex: req.query.payerName.trim(), $options: 'i' };
    }

    // Requisite filter
    if (req.query.requisite) {
      const r = req.query.requisite.trim();
      filter.$or = [
        { requisite: { $regex: r, $options: 'i' } },
        { merchantName: { $regex: r, $options: 'i' } },
      ];
    }

    // Status filter
    if (req.query.status && req.query.status !== 'ALL') {
      filter.status = req.query.status.toUpperCase();
    }

    // Amount Range
    if (req.query.minAmount !== undefined && req.query.minAmount !== '') {
      const minA = parseFloat(req.query.minAmount);
      if (!isNaN(minA)) {
        filter.amount = { ...filter.amount, $gte: minA };
      }
    }
    if (req.query.maxAmount !== undefined && req.query.maxAmount !== '') {
      const maxA = parseFloat(req.query.maxAmount);
      if (!isNaN(maxA)) {
        filter.amount = { ...filter.amount, $lte: maxA };
      }
    }

    // Date Range
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

    // General search across key fields
    if (req.query.search) {
      const s = req.query.search.trim();
      filter.$or = [
        { applicationId: { $regex: s, $options: 'i' } },
        { requestId: { $regex: s, $options: 'i' } },
        { orderId: { $regex: s, $options: 'i' } },
        { utr: { $regex: s, $options: 'i' } },
        { referenceId: { $regex: s, $options: 'i' } },
        { payerName: { $regex: s, $options: 'i' } },
        { requisite: { $regex: s, $options: 'i' } },
        { merchantName: { $regex: s, $options: 'i' } },
      ];
    }

    // Allowed sort fields
    const safeSortFields = ['createdAt', 'amount', 'applicationId', 'orderId', 'status', 'payerName', 'requisite'];
    const activeSortField = safeSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const sortObj = { [activeSortField]: sortOrder };

    const total = await PayInRequest.countDocuments(filter);
    const rawDocs = await PayInRequest.find(filter)
      .sort(sortObj)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const data = rawDocs.map(formatApplicationDoc);
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
    console.error('[getTraderApplications Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch applications.',
    });
  }
};

// GET /api/trader/applications/:id
const getTraderApplicationById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const query = {
      $and: [
        { userId },
        {
          $or: [
            { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null },
            { applicationId: id },
            { requestId: id },
            { orderId: id },
          ].filter(Boolean),
        },
      ],
    };

    const doc = await PayInRequest.findOne(query).lean();
    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'Application not found or unauthorized.',
      });
    }

    return res.status(200).json({
      success: true,
      data: formatApplicationDoc(doc),
    });
  } catch (error) {
    console.error('[getTraderApplicationById Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve application details.',
    });
  }
};

// GET /api/trader/applications/export
const exportTraderApplicationsCsv = async (req, res) => {
  try {
    const userId = req.user._id;
    const filter = { userId };

    if (req.query.status && req.query.status !== 'ALL') {
      filter.status = req.query.status.toUpperCase();
    }
    if (req.query.applicationId) {
      filter.$or = [
        { applicationId: { $regex: req.query.applicationId.trim(), $options: 'i' } },
        { requestId: { $regex: req.query.applicationId.trim(), $options: 'i' } },
      ];
    }
    if (req.query.orderId) {
      filter.orderId = { $regex: req.query.orderId.trim(), $options: 'i' };
    }
    if (req.query.utr) {
      filter.$or = [
        { utr: { $regex: req.query.utr.trim(), $options: 'i' } },
        { referenceId: { $regex: req.query.utr.trim(), $options: 'i' } },
      ];
    }
    if (req.query.payerName) {
      filter.payerName = { $regex: req.query.payerName.trim(), $options: 'i' };
    }

    const rawDocs = await PayInRequest.find(filter).sort({ createdAt: -1 }).lean();
    const formatted = rawDocs.map(formatApplicationDoc);

    const headers = [
      'Application ID',
      'Order ID',
      'UTR',
      'Payer Name',
      'Requisite',
      'Amount',
      'Currency',
      'Status',
      'Created At',
    ];

    const rows = formatted.map((app) => [
      escapeCsvValue(app.applicationId),
      escapeCsvValue(app.orderId),
      escapeCsvValue(app.utr),
      escapeCsvValue(app.payerName),
      escapeCsvValue(app.requisite),
      escapeCsvValue(app.amount ? app.amount.toFixed(2) : '0.00'),
      escapeCsvValue(app.currency),
      escapeCsvValue(app.status),
      escapeCsvValue(app.createdAt ? new Date(app.createdAt).toISOString() : ''),
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="inrpay_applications_${Date.now()}.csv"`
    );
    return res.status(200).send(csvContent);
  } catch (error) {
    console.error('[exportTraderApplicationsCsv Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate CSV export.',
    });
  }
};

// ==========================================
// ADMIN APPLICATION CONTROLLERS
// ==========================================

// GET /api/admin/applications
const getAllApplicationsAdmin = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20));
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

    const filter = {};

    if (req.query.traderId) {
      filter.userId = req.query.traderId;
    } else if (req.query.clientId) {
      filter.clientId = { $regex: req.query.clientId.trim(), $options: 'i' };
    }

    if (req.query.applicationId) {
      const q = req.query.applicationId.trim();
      filter.$or = [
        { applicationId: { $regex: q, $options: 'i' } },
        { requestId: { $regex: q, $options: 'i' } },
      ];
    }

    if (req.query.orderId) {
      filter.orderId = { $regex: req.query.orderId.trim(), $options: 'i' };
    }

    if (req.query.utr) {
      const u = req.query.utr.trim();
      filter.$or = [
        { utr: { $regex: u, $options: 'i' } },
        { referenceId: { $regex: u, $options: 'i' } },
      ];
    }

    if (req.query.payerName) {
      filter.payerName = { $regex: req.query.payerName.trim(), $options: 'i' };
    }

    if (req.query.requisite) {
      const r = req.query.requisite.trim();
      filter.$or = [
        { requisite: { $regex: r, $options: 'i' } },
        { merchantName: { $regex: r, $options: 'i' } },
      ];
    }

    if (req.query.status && req.query.status !== 'ALL') {
      filter.status = req.query.status.toUpperCase();
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

    if (req.query.search) {
      const s = req.query.search.trim();
      filter.$or = [
        { applicationId: { $regex: s, $options: 'i' } },
        { requestId: { $regex: s, $options: 'i' } },
        { orderId: { $regex: s, $options: 'i' } },
        { utr: { $regex: s, $options: 'i' } },
        { referenceId: { $regex: s, $options: 'i' } },
        { payerName: { $regex: s, $options: 'i' } },
        { clientId: { $regex: s, $options: 'i' } },
        { requisite: { $regex: s, $options: 'i' } },
        { merchantName: { $regex: s, $options: 'i' } },
      ];
    }

    const safeSortFields = ['createdAt', 'amount', 'applicationId', 'orderId', 'status', 'payerName', 'clientId', 'requisite'];
    const activeSortField = safeSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const sortObj = { [activeSortField]: sortOrder };

    const total = await PayInRequest.countDocuments(filter);
    const rawDocs = await PayInRequest.find(filter)
      .sort(sortObj)
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('userId', 'username role status email')
      .populate('reviewedBy', 'username')
      .lean();

    const data = rawDocs.map(formatApplicationDoc);
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
    console.error('[getAllApplicationsAdmin Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch admin applications.',
    });
  }
};

// GET /api/admin/applications/:id
const getApplicationByIdAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const query = {
      $or: [
        { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null },
        { applicationId: id },
        { requestId: id },
        { orderId: id },
      ].filter(Boolean),
    };

    const doc = await PayInRequest.findOne(query)
      .populate('userId', 'username role status email')
      .populate('reviewedBy', 'username')
      .populate('statusHistory.changedBy', 'username')
      .lean();

    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'Application not found.',
      });
    }

    return res.status(200).json({
      success: true,
      data: formatApplicationDoc(doc),
    });
  } catch (error) {
    console.error('[getApplicationByIdAdmin Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve application details.',
    });
  }
};

// PATCH /api/admin/applications/:id
const adminReviewApplication = async (req, res) => {
  const { id } = req.params;
  const { action, decisionNotes = '', verificationEvidence = '' } = req.body;
  // action: 'CONFIRM', 'DECLINE', 'REJECT', 'UNDER_REVIEW', 'PROCESSING'

  const validActions = ['CONFIRM', 'DECLINE', 'REJECT', 'UNDER_REVIEW', 'PROCESSING'];
  if (!validActions.includes(action)) {
    return res.status(400).json({
      success: false,
      message: `Invalid action. Permitted actions: ${validActions.join(', ')}`,
    });
  }

  try {
    const payIn = await PayInRequest.findOne({
      $or: [
        { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null },
        { applicationId: id },
        { requestId: id },
      ].filter(Boolean),
    });

    if (!payIn) {
      return res.status(404).json({
        success: false,
        message: 'Application not found.',
      });
    }

    if (['CONFIRMED', 'DECLINED', 'REJECTED', 'DEMO_TRANSACTION'].includes(payIn.status)) {
      return res.status(400).json({
        success: false,
        message: `This application has already reached terminal status '${payIn.status}'. Status is immutable.`,
      });
    }

    const previousStatus = payIn.status;
    let newStatus = previousStatus;

    if (action === 'PROCESSING') {
      newStatus = 'PROCESSING';
      payIn.status = 'PROCESSING';
      payIn.verificationStatus = 'UNDER_REVIEW';
      payIn.adminDecisionNotes = decisionNotes || 'Application being processed';
    } else if (action === 'UNDER_REVIEW') {
      newStatus = 'UNDER_REVIEW';
      payIn.status = 'UNDER_REVIEW';
      payIn.verificationStatus = 'UNDER_REVIEW';
      payIn.adminDecisionNotes = decisionNotes || 'Under administrative verification';
    } else if (action === 'DECLINE' || action === 'REJECT') {
      newStatus = 'DECLINED';
      payIn.status = 'DECLINED';
      payIn.verificationStatus = 'REJECTED';
      payIn.adminConfirmationStatus = 'REJECTED';
      payIn.adminDecisionNotes = decisionNotes || 'Application declined by administrator';
      payIn.verifiedAt = new Date();
      payIn.verifiedBy = req.user._id;
      payIn.reviewedBy = req.user._id;
      payIn.reviewedAt = new Date();
      payIn.reviewNotes = decisionNotes || 'Declined';

      await AuditLog.log({
        action: 'APPLICATION_DECLINED',
        user: req.user,
        targetUserId: payIn.userId,
        targetUsername: payIn.clientId,
        ipAddress: req.ip || '',
        userAgent: req.get('User-Agent') || '',
        details: {
          applicationId: payIn.applicationId || payIn.requestId,
          orderId: payIn.orderId,
          amount: payIn.amount,
          reason: payIn.adminDecisionNotes,
        },
      });

      await Notification.sendNotification({
        recipientUserId: payIn.userId,
        recipientClientId: payIn.clientId,
        type: 'PAYMENT_NOT_VERIFIED',
        title: 'Application Declined',
        message: `Application ${payIn.applicationId || payIn.requestId} (${payIn.currency} ${payIn.amount}) was declined. Reason: ${payIn.adminDecisionNotes}`,
        paymentId: payIn.applicationId || payIn.requestId,
        amount: payIn.amount,
        currency: payIn.currency,
        referenceId: payIn.utr || payIn.referenceId,
      });
    } else if (action === 'CONFIRM') {
      if (payIn.isDemo) {
        newStatus = 'DEMO_TRANSACTION';
        payIn.status = 'DEMO_TRANSACTION';
        payIn.verificationStatus = 'VERIFIED';
        payIn.adminConfirmationStatus = 'ADMIN_CONFIRMED';
        payIn.adminDecisionNotes = decisionNotes || 'Demo simulated confirmation (No ledger impact)';
        payIn.verifiedAt = new Date();
        payIn.verifiedBy = req.user._id;
        payIn.reviewedBy = req.user._id;
        payIn.reviewedAt = new Date();
        payIn.reviewNotes = decisionNotes || 'Demo Confirmed';
      } else {
        // LIVE FINANCIAL SETTLEMENT: Atomic Balance Ledger Entry
        await BalanceLedger.recordVerifiedEntry({
          userId: payIn.userId,
          clientId: payIn.clientId,
          currency: payIn.currency,
          entryType: 'PAYIN_CONFIRMED',
          amount: payIn.amount,
          referenceRequestId: payIn.applicationId || payIn.requestId,
          notes: decisionNotes || `Verified Application PayIn confirmed: UTR ${payIn.utr || payIn.referenceId || 'N/A'}`,
          performedBy: req.user._id,
        });

        newStatus = 'CONFIRMED';
        payIn.status = 'CONFIRMED';
        payIn.verificationStatus = 'VERIFIED';
        payIn.adminConfirmationStatus = 'ADMIN_CONFIRMED';
        payIn.adminDecisionNotes = decisionNotes || 'Application confirmed with verified settlement';
        payIn.verifiedAt = new Date();
        payIn.verifiedBy = req.user._id;
        payIn.adminConfirmedAt = new Date();
        payIn.adminConfirmedBy = req.user._id;
        payIn.reviewedBy = req.user._id;
        payIn.reviewedAt = new Date();
        payIn.reviewNotes = decisionNotes || 'Confirmed';
      }

      await AuditLog.log({
        action: payIn.isDemo ? 'DEMO_APPLICATION_CONFIRMED' : 'APPLICATION_CONFIRMED',
        user: req.user,
        targetUserId: payIn.userId,
        targetUsername: payIn.clientId,
        ipAddress: req.ip || '',
        userAgent: req.get('User-Agent') || '',
        details: {
          applicationId: payIn.applicationId || payIn.requestId,
          orderId: payIn.orderId,
          amount: payIn.amount,
          isDemo: payIn.isDemo,
        },
      });

      await Notification.sendNotification({
        recipientUserId: payIn.userId,
        recipientClientId: payIn.clientId,
        type: 'PAYMENT_CONFIRMED',
        title: 'Application Confirmed',
        message: `Application ${payIn.applicationId || payIn.requestId} (${payIn.currency} ${payIn.amount}) confirmed. Balance credited.`,
        paymentId: payIn.applicationId || payIn.requestId,
        amount: payIn.amount,
        currency: payIn.currency,
        referenceId: payIn.utr || payIn.referenceId,
      });
    }

    // Add status history entry
    payIn.statusHistory.push({
      status: newStatus,
      changedAt: new Date(),
      changedBy: req.user._id,
      notes: decisionNotes || `Status changed from ${previousStatus} to ${newStatus}`,
    });

    await payIn.save();

    return res.status(200).json({
      success: true,
      message: `Application status updated to ${newStatus}.`,
      data: formatApplicationDoc(payIn),
    });
  } catch (error) {
    console.error('[adminReviewApplication Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: `Failed to review application: ${error.message}`,
    });
  }
};

// GET /api/admin/applications/export
const exportApplicationsAdminCsv = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status && req.query.status !== 'ALL') {
      filter.status = req.query.status.toUpperCase();
    }
    if (req.query.traderId) {
      filter.userId = req.query.traderId;
    }

    const rawDocs = await PayInRequest.find(filter)
      .sort({ createdAt: -1 })
      .populate('userId', 'username')
      .lean();

    const formatted = rawDocs.map(formatApplicationDoc);

    const headers = [
      'Application ID',
      'Order ID',
      'Trader',
      'UTR',
      'Payer Name',
      'Requisite',
      'Amount',
      'Currency',
      'Status',
      'Created At',
    ];

    const rows = formatted.map((app) => [
      escapeCsvValue(app.applicationId),
      escapeCsvValue(app.orderId),
      escapeCsvValue(app.trader?.username || ''),
      escapeCsvValue(app.utr),
      escapeCsvValue(app.payerName),
      escapeCsvValue(app.requisite),
      escapeCsvValue(app.amount ? app.amount.toFixed(2) : '0.00'),
      escapeCsvValue(app.currency),
      escapeCsvValue(app.status),
      escapeCsvValue(app.createdAt ? new Date(app.createdAt).toISOString() : ''),
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="admin_applications_${Date.now()}.csv"`
    );
    return res.status(200).send(csvContent);
  } catch (error) {
    console.error('[exportApplicationsAdminCsv Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate Admin CSV export.',
    });
  }
};

// GET /api/admin/applications/:id/history
const getApplicationHistoryAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const query = {
      $or: [
        { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null },
        { applicationId: id },
        { requestId: id },
      ].filter(Boolean),
    };

    const doc = await PayInRequest.findOne(query)
      .populate('statusHistory.changedBy', 'username role')
      .lean();

    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'Application not found.',
      });
    }

    return res.status(200).json({
      success: true,
      data: doc.statusHistory || [],
    });
  } catch (error) {
    console.error('[getApplicationHistoryAdmin Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch application status history.',
    });
  }
};

module.exports = {
  getTraderApplications,
  getTraderApplicationById,
  exportTraderApplicationsCsv,
  getAllApplicationsAdmin,
  getApplicationByIdAdmin,
  adminReviewApplication,
  exportApplicationsAdminCsv,
  getApplicationHistoryAdmin,
};
