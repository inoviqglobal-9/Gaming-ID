const crypto = require('crypto');
const PayInRequest = require('../models/PayInRequest');
const ScannerConfig = require('../models/ScannerConfig');
const BalanceLedger = require('../models/BalanceLedger');
const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');
const { config } = require('../config/env');

const generateRequestId = () => {
  return `PIN-${Date.now().toString().slice(-6)}-${crypto.randomInt(1000, 9999)}`;
};

// POST /api/payin (Client initiates PayIn / Make Payment)
const createPayIn = async (req, res) => {
  const { amount, currency = 'INR', clientNotes } = req.body;
  const numAmount = parseFloat(amount);

  if (!numAmount || numAmount <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a valid amount greater than zero.',
    });
  }

  if (!['INR', 'USDT'].includes(currency.toUpperCase())) {
    return res.status(400).json({
      success: false,
      message: "Supported currencies are 'INR' and 'USDT'.",
    });
  }

  try {
    // 1. Fetch active, published scanner
    let activeScanner = await ScannerConfig.findOne({
      isActive: true,
      status: 'ACTIVE',
      isPublished: true,
    }).sort({ updatedAt: -1 });

    if (!activeScanner) {
      const totalScanners = await ScannerConfig.countDocuments();
      if (totalScanners === 0) {
        const { seedDemoScanner } = require('../scripts/seedDemoScanner');
        activeScanner = await seedDemoScanner();
      }
    }

    if (!activeScanner) {
      return res.status(503).json({
        success: false,
        isAvailable: false,
        message: 'PhonePe payments are currently unavailable. Please contact support.',
      });
    }

    const expiresAt = new Date(Date.now() + config.payinExpiryMinutes * 60 * 1000);
    const requestId = generateRequestId();
    const isDemo = activeScanner.mode === 'DEMO_ONLY';

    // 2. Permanently bind scanner snapshot & merchant identity to this payment order
    const payIn = new PayInRequest({
      requestId,
      userId: req.user._id,
      clientId: req.user.username,
      amount: Number(numAmount.toFixed(2)),
      currency: currency.toUpperCase(),
      status: 'PENDING',
      scannerConfigId: activeScanner._id,
      scannerId: activeScanner.scannerId,
      scannerName: activeScanner.scannerName,
      scannerVersion: activeScanner.version,
      merchantName: activeScanner.merchantName,
      merchantIdentifier: activeScanner.merchantIdentifier,
      paymentProvider: activeScanner.paymentProvider,
      qrImageUrl: activeScanner.qrImageUrl || activeScanner.assetUrl,
      mode: activeScanner.mode,
      isDemo,
      clientNotes: clientNotes ? clientNotes.trim() : '',
      expiresAt,
    });

    await payIn.save();

    await AuditLog.log({
      action: isDemo ? 'DEMO_PAYIN_REQUEST_CREATED' : 'PAYIN_REQUEST_CREATED',
      user: req.user,
      ipAddress: req.ip || '',
      userAgent: req.get('User-Agent') || '',
      details: {
        requestId,
        amount: payIn.amount,
        merchantName: payIn.merchantName,
        scannerId: payIn.scannerId,
        isDemo,
      },
    });

    return res.status(201).json({
      success: true,
      message: isDemo
        ? 'Demo payment request created. DEMO ONLY — DO NOT PAY.'
        : 'Payment request created. Scan official QR and submit UTR.',
      payIn: {
        id: payIn._id,
        requestId: payIn.requestId,
        amount: payIn.amount,
        currency: payIn.currency,
        status: payIn.status,
        merchantName: payIn.merchantName,
        merchantIdentifier: payIn.merchantIdentifier,
        scannerId: payIn.scannerId,
        scannerVersion: payIn.scannerVersion,
        qrImageUrl: payIn.qrImageUrl,
        isDemo: payIn.isDemo,
        expiresAt: payIn.expiresAt,
        createdAt: payIn.createdAt,
      },
      scanner: {
        id: activeScanner._id,
        scannerId: activeScanner.scannerId,
        scannerName: activeScanner.scannerName,
        merchantName: activeScanner.merchantName,
        paymentProvider: activeScanner.paymentProvider,
        qrImageUrl: activeScanner.qrImageUrl || activeScanner.assetUrl,
        instructions: activeScanner.instructions,
        isDemo,
      },
    });
  } catch (error) {
    console.error('[Create PayIn Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to create PayIn request.',
    });
  }
};

// GET /api/payin/my (Client view their own requests)
const getMyPayIns = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const status = req.query.status;

    const filter = { userId: req.user._id };
    if (status) filter.status = status.toUpperCase();

    const total = await PayInRequest.countDocuments(filter);
    const requests = await PayInRequest.find(filter)
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
    console.error('[Get My PayIns Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to load PayIn requests.',
    });
  }
};

// POST /api/payin/:id/submit-reference (Client submits payment claim: "I Have Paid")
const submitPayInReference = async (req, res) => {
  const { id } = req.params;
  const { referenceId, notes } = req.body;

  if (!referenceId || referenceId.trim().length < 4) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a valid payment Reference or 12-digit UTR number.',
    });
  }

  const cleanRef = referenceId.trim();

  try {
    const payIn = await PayInRequest.findOne({ _id: id, userId: req.user._id });
    if (!payIn) {
      return res.status(404).json({
        success: false,
        message: 'Payment request not found or does not belong to you.',
      });
    }

    if (['CONFIRMED', 'REJECTED', 'EXPIRED', 'DEMO_TRANSACTION'].includes(payIn.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot update payment in '${payIn.status}' status.`,
      });
    }

    // Duplicate check on reference across live records
    const duplicate = await PayInRequest.findOne({
      referenceId: cleanRef,
      _id: { $ne: payIn._id },
    });
    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: 'This payment reference has already been submitted on another request.',
      });
    }

    payIn.referenceId = cleanRef;
    if (notes) payIn.clientNotes = notes.trim();
    payIn.status = 'PENDING_VERIFICATION';
    payIn.verificationStatus = 'UNVERIFIED';
    await payIn.save();

    await AuditLog.log({
      action: 'PAYIN_CLAIM_SUBMITTED',
      user: req.user,
      ipAddress: req.ip || '',
      userAgent: req.get('User-Agent') || '',
      details: {
        requestId: payIn.requestId,
        referenceId: cleanRef,
        merchantName: payIn.merchantName,
        isDemo: payIn.isDemo,
      },
    });

    // Notify client: Verification Pending
    await Notification.sendNotification({
      recipientUserId: payIn.userId,
      recipientClientId: payIn.clientId,
      type: 'PAYMENT_PENDING_VERIFICATION',
      title: 'Payment Verification Pending',
      message: `Your payment claim for ${payIn.currency} ${payIn.amount} (Ref: ${cleanRef}) was received. Administrative verification in progress against merchant ${payIn.merchantName}.`,
      paymentId: payIn.requestId,
      amount: payIn.amount,
      currency: payIn.currency,
      referenceId: cleanRef,
    });

    return res.status(200).json({
      success: true,
      message: 'Payment claim submitted successfully. Payment Verification Pending.',
      payIn,
    });
  } catch (error) {
    console.error('[Submit PayIn Claim Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit payment claim.',
    });
  }
};

// GET /api/admin/payin (Admin views all requests with multi-merchant and scanner filters)
const getAllPayInsAdmin = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 15;
    const { status, search, currency, merchant, mode } = req.query;

    const filter = {};
    if (status) filter.status = status.toUpperCase();
    if (currency) filter.currency = currency.toUpperCase();
    if (merchant) filter.merchantName = { $regex: merchant, $options: 'i' };
    if (mode) filter.mode = mode.toUpperCase();

    if (search) {
      filter.$or = [
        { clientId: { $regex: search, $options: 'i' } },
        { requestId: { $regex: search, $options: 'i' } },
        { referenceId: { $regex: search, $options: 'i' } },
        { merchantName: { $regex: search, $options: 'i' } },
      ];
    }

    const total = await PayInRequest.countDocuments(filter);
    const requests = await PayInRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('userId', 'username status')
      .populate('verifiedBy', 'username')
      .populate('adminConfirmedBy', 'username');

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
    console.error('[Admin getAllPayIns Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch PayIn requests.',
    });
  }
};

// PATCH /api/admin/payin/:id/review (Admin Verification & "₹ Received — Confirm Payment")
const adminReviewPayIn = async (req, res) => {
  const { id } = req.params;
  const { action, decisionNotes, verificationEvidence = '' } = req.body;
  // action: 'CONFIRM' (₹ Received), 'REJECT', 'UNDER_REVIEW'

  if (!['CONFIRM', 'REJECT', 'UNDER_REVIEW'].includes(action)) {
    return res.status(400).json({
      success: false,
      message: "Permitted actions are 'CONFIRM', 'REJECT', or 'UNDER_REVIEW'.",
    });
  }

  try {
    const payIn = await PayInRequest.findById(id);
    if (!payIn) {
      return res.status(404).json({
        success: false,
        message: 'Payment request not found.',
      });
    }

    if (['CONFIRMED', 'REJECTED', 'DEMO_TRANSACTION'].includes(payIn.status)) {
      return res.status(400).json({
        success: false,
        message: `This payment request has already been finalized as '${payIn.status}'. Status is immutable.`,
      });
    }

    if (action === 'UNDER_REVIEW') {
      payIn.status = 'UNDER_REVIEW';
      payIn.verificationStatus = 'UNDER_REVIEW';
      payIn.adminDecisionNotes = decisionNotes || 'Under administrative verification with receiving merchant';
      await payIn.save();

      return res.status(200).json({
        success: true,
        message: 'Payment moved to Under Review.',
        payIn,
      });
    }

    if (action === 'REJECT') {
      payIn.status = 'REJECTED';
      payIn.verificationStatus = 'REJECTED';
      payIn.adminConfirmationStatus = 'REJECTED';
      payIn.adminDecisionNotes = decisionNotes || 'Payment verification failed: no matching receipt found';
      payIn.verifiedAt = new Date();
      payIn.verifiedBy = req.user._id;
      await payIn.save();

      await AuditLog.log({
        action: 'PAYIN_REJECTED',
        user: req.user,
        targetUserId: payIn.userId,
        targetUsername: payIn.clientId,
        ipAddress: req.ip || '',
        userAgent: req.get('User-Agent') || '',
        details: {
          requestId: payIn.requestId,
          merchantName: payIn.merchantName,
          reason: payIn.adminDecisionNotes,
        },
      });

      // Notify Client: Payment Not Verified
      await Notification.sendNotification({
        recipientUserId: payIn.userId,
        recipientClientId: payIn.clientId,
        type: 'PAYMENT_NOT_VERIFIED',
        title: 'Payment Verification Declined',
        message: `Payment request ${payIn.requestId} (${payIn.currency} ${payIn.amount}) was not verified. Reason: ${payIn.adminDecisionNotes}.`,
        paymentId: payIn.requestId,
        amount: payIn.amount,
        currency: payIn.currency,
        referenceId: payIn.referenceId,
      });

      return res.status(200).json({
        success: true,
        message: 'Payment marked as REJECTED. Client notified.',
        payIn,
      });
    }

    if (action === 'CONFIRM') {
      // If DEMO transaction: mark confirmed without crediting real financial ledger!
      if (payIn.isDemo) {
        payIn.status = 'DEMO_TRANSACTION';
        payIn.verificationStatus = 'VERIFIED';
        payIn.adminConfirmationStatus = 'ADMIN_CONFIRMED';
        payIn.adminDecisionNotes = decisionNotes || 'Demo simulated confirmation (Excluded from revenue)';
        payIn.verifiedAt = new Date();
        payIn.verifiedBy = req.user._id;
        payIn.adminConfirmedAt = new Date();
        payIn.adminConfirmedBy = req.user._id;
        await payIn.save();

        await AuditLog.log({
          action: 'DEMO_PAYMENT_CONFIRMED',
          user: req.user,
          targetUserId: payIn.userId,
          targetUsername: payIn.clientId,
          details: { requestId: payIn.requestId, amount: payIn.amount, isDemo: true },
        });

        await Notification.sendNotification({
          recipientUserId: payIn.userId,
          recipientClientId: payIn.clientId,
          type: 'DEMO_PAYMENT_CONFIRMED',
          title: 'Demo Payment Confirmed',
          message: `Simulated Demo payment ${payIn.requestId} confirmed. Demo transactions do not affect real wallet balance.`,
          paymentId: payIn.requestId,
          amount: payIn.amount,
          currency: payIn.currency,
          referenceId: payIn.referenceId,
        });

        return res.status(200).json({
          success: true,
          message: 'Demo payment simulated and confirmed. Excluded from real ledger revenue.',
          payIn,
        });
      }

      // LIVE TRANSACTION: Independent verification rule & atomic ledger credit!
      await BalanceLedger.recordVerifiedEntry({
        userId: payIn.userId,
        clientId: payIn.clientId,
        currency: payIn.currency,
        entryType: 'PAYIN_CONFIRMED',
        amount: payIn.amount,
        referenceRequestId: payIn.requestId,
        notes: decisionNotes || `Verified PhonePe payment to ${payIn.merchantName}: Ref ${payIn.referenceId || 'N/A'}`,
        performedBy: req.user._id,
      });

      payIn.status = 'CONFIRMED';
      payIn.verificationStatus = 'VERIFIED';
      payIn.adminConfirmationStatus = 'ADMIN_CONFIRMED';
      payIn.verificationEvidence = verificationEvidence.trim() || 'Verified against PhonePe Business merchant settlement';
      payIn.adminDecisionNotes = decisionNotes || `Receipt verified on merchant ${payIn.merchantName} account`;
      payIn.verifiedAt = new Date();
      payIn.verifiedBy = req.user._id;
      payIn.adminConfirmedAt = new Date();
      payIn.adminConfirmedBy = req.user._id;
      await payIn.save();

      await AuditLog.log({
        action: 'PAYIN_CONFIRMED_CREDITED',
        user: req.user,
        targetUserId: payIn.userId,
        targetUsername: payIn.clientId,
        ipAddress: req.ip || '',
        userAgent: req.get('User-Agent') || '',
        details: {
          requestId: payIn.requestId,
          amount: payIn.amount,
          currency: payIn.currency,
          merchantName: payIn.merchantName,
          scannerId: payIn.scannerId,
          referenceId: payIn.referenceId,
        },
      });

      // Send Client Notification: Payment Confirmed
      await Notification.sendNotification({
        recipientUserId: payIn.userId,
        recipientClientId: payIn.clientId,
        type: 'PAYMENT_CONFIRMED',
        title: 'Payment Confirmed — ₹ Received',
        message: `Your payment of ${payIn.currency} ${payIn.amount} (Ref: ${payIn.referenceId}) was verified and credited to your verified balance.`,
        paymentId: payIn.requestId,
        amount: payIn.amount,
        currency: payIn.currency,
        referenceId: payIn.referenceId,
        confirmedAt: payIn.adminConfirmedAt,
      });

      return res.status(200).json({
        success: true,
        message: `Payment verified! ${payIn.currency} ${payIn.amount} confirmed and credited to client ledger.`,
        payIn,
      });
    }
  } catch (error) {
    console.error('[Admin Review PayIn Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: `Failed to review payment: ${error.message}`,
    });
  }
};

module.exports = {
  createPayIn,
  getMyPayIns,
  submitPayInReference,
  getAllPayInsAdmin,
  adminReviewPayIn,
};
