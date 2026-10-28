const WalletCheck = require('../models/WalletCheck');
const WalletCheckSettings = require('../models/WalletCheckSettings');
const BalanceLedger = require('../models/BalanceLedger');
const AuditLog = require('../models/AuditLog');
const { validateCryptoAddress } = require('../utils/addressValidator');
const AmlProviderService = require('../services/amlProviderService');

/**
 * Generate unique Check ID (e.g. CHK-863750-7195)
 */
const generateCheckId = async () => {
  let unique = false;
  let checkId = '';
  while (!unique) {
    const timestampPart = Date.now().toString().slice(-6);
    const randPart = Math.floor(1000 + Math.random() * 9000);
    checkId = `CHK-${timestampPart}-${randPart}`;
    const exists = await WalletCheck.findOne({ checkId });
    if (!exists) unique = true;
  }
  return checkId;
};

// ==========================================
// TRADER CONTROLLERS
// ==========================================

/**
 * GET /api/trader/wallet-check/settings
 * Retrieve public settings and trader's USDT balance
 */
const getTraderSettings = async (req, res) => {
  try {
    const userId = req.user._id;
    const settings = await WalletCheckSettings.getOrCreateDefault();
    const usdtBalance = await BalanceLedger.calculateAvailableBalance(userId, 'USDT');

    // Count checks performed today by this trader
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const todayChecksCount = await WalletCheck.countDocuments({
      userId,
      createdAt: { $gte: startOfToday },
    });

    return res.status(200).json({
      success: true,
      data: {
        enabled: settings.enabled,
        feeAmount: settings.feeAmount,
        feeCurrency: settings.feeCurrency,
        supportedNetworks: settings.supportedNetworks,
        providerName: settings.providerName,
        dailyCheckLimit: settings.dailyCheckLimit,
        todayChecksCount,
        remainingChecksToday: Math.max(0, settings.dailyCheckLimit - todayChecksCount),
        availableUsdtBalance: usdtBalance,
        canAffordCheck: usdtBalance >= settings.feeAmount,
      },
    });
  } catch (error) {
    console.error('[getTraderSettings Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve wallet check settings.',
    });
  }
};

/**
 * GET /api/trader/wallet-check/history
 * Retrieve check history for authenticated trader
 */
const getTraderHistory = async (req, res) => {
  try {
    const userId = req.user._id;
    const { search, network, status, page = 1, limit = 20 } = req.query;

    const query = { userId };

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [{ walletAddress: regex }, { checkId: regex }];
    }

    if (network && network !== 'ALL') {
      query.network = network.toUpperCase();
    }

    if (status && status !== 'ALL') {
      query.status = status.toUpperCase();
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [checks, total] = await Promise.all([
      WalletCheck.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      WalletCheck.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: checks.map((c) => ({
        ...c,
        maskedAddress:
          c.walletAddress.length > 12
            ? `${c.walletAddress.slice(0, 6)}...${c.walletAddress.slice(-4)}`
            : c.walletAddress,
      })),
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    console.error('[getTraderHistory Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve wallet check history.',
    });
  }
};

/**
 * POST /api/trader/wallet-check
 * Submit a wallet check request
 */
const createTraderWalletCheck = async (req, res) => {
  try {
    const userId = req.user._id;
    const clientId = req.user.username;
    const { walletAddress, network = 'TRC-20' } = req.body;

    // 1. Verify user is active
    if (req.user.status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        message: 'Account is not in active status. Wallet checking is disabled.',
      });
    }

    // 2. Check settings enabled
    const settings = await WalletCheckSettings.getOrCreateDefault();
    if (!settings.enabled) {
      return res.status(400).json({
        success: false,
        message: 'Wallet Check service is currently disabled by administrator.',
      });
    }

    // 3. Validate network
    const cleanNetwork = (network || 'TRC-20').toUpperCase();
    const isNetworkSupported = (settings.supportedNetworks || ['TRC-20']).some(
      (n) => n.toUpperCase() === cleanNetwork
    );

    if (!isNetworkSupported) {
      return res.status(400).json({
        success: false,
        message: `Network ${network} is not supported. Supported networks: ${settings.supportedNetworks.join(', ')}`,
      });
    }

    // 4. Validate Address
    const addressValidation = validateCryptoAddress(walletAddress, cleanNetwork);
    if (!addressValidation.valid) {
      return res.status(400).json({
        success: false,
        message: addressValidation.message,
      });
    }

    const cleanAddress = addressValidation.cleanAddress;

    // 5. Daily check limit
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayCount = await WalletCheck.countDocuments({
      userId,
      createdAt: { $gte: startOfToday },
    });

    if (todayCount >= (settings.dailyCheckLimit || 50)) {
      return res.status(400).json({
        success: false,
        message: `Daily wallet check limit of ${settings.dailyCheckLimit} reached. Please try again tomorrow.`,
      });
    }

    // 6. Check available USDT balance
    const fee = Number(settings.feeAmount || 3.0);
    const usdtBalance = await BalanceLedger.calculateAvailableBalance(userId, 'USDT');

    if (usdtBalance < fee) {
      return res.status(400).json({
        success: false,
        code: 'INSUFFICIENT_BALANCE',
        message: `Insufficient balance. Minimum ${fee.toFixed(2)} USDT required for wallet checking. (Your balance: ${usdtBalance.toFixed(2)} USDT)`,
        availableBalance: usdtBalance,
        requiredFee: fee,
      });
    }

    // 7. Create WalletCheck record in PENDING state
    const checkId = await generateCheckId();
    const walletCheck = new WalletCheck({
      checkId,
      userId,
      clientId,
      walletAddress: cleanAddress,
      network: cleanNetwork,
      provider: settings.providerName,
      status: 'PENDING',
      feeAmount: fee,
      feeCurrency: settings.feeCurrency || 'USDT',
      feeStatus: 'NOT_CHARGED',
    });
    await walletCheck.save();

    // 8. Execute screening via Provider Service
    const screening = await AmlProviderService.screenAddress({
      walletAddress: cleanAddress,
      network: cleanNetwork,
      traderId: clientId,
    });

    // 9. If screening was NOT performed (provider error/unavailable), do NOT charge fee
    if (!screening.performed || !screening.success) {
      walletCheck.status = 'FAILED';
      walletCheck.feeStatus = 'NOT_CHARGED';
      walletCheck.notes = screening.error || 'Screening could not be performed by provider.';
      await walletCheck.save();

      return res.status(503).json({
        success: false,
        message: screening.error || 'Screening service could not be performed. No fee was charged.',
        data: walletCheck,
      });
    }

    // 10. Screening WAS performed successfully -> Atomically deduct fee
    let ledgerEntry;
    try {
      ledgerEntry = await BalanceLedger.recordVerifiedEntry({
        userId,
        clientId,
        currency: 'USDT',
        entryType: 'WALLET_CHECK_FEE',
        amount: -fee,
        referenceRequestId: checkId,
        notes: `Wallet Check AML screening fee for address ${cleanAddress.slice(0, 8)}... (${cleanNetwork})`,
        performedBy: userId,
      });
    } catch (ledgerErr) {
      console.error('[WalletCheck Ledger Error]:', ledgerErr.message);
      walletCheck.status = 'COMPLETED';
      walletCheck.feeStatus = 'NOT_CHARGED';
      walletCheck.notes = `Screening performed but fee deduction failed: ${ledgerErr.message}`;
      await walletCheck.save();

      return res.status(200).json({
        success: true,
        message: 'Screening completed.',
        data: walletCheck,
      });
    }

    // 11. Finalize check record
    walletCheck.status = 'COMPLETED';
    walletCheck.provider = screening.provider;
    walletCheck.providerRequestId = screening.providerRequestId;
    walletCheck.riskScore = screening.riskScore;
    walletCheck.riskCategory = screening.riskCategory;
    walletCheck.riskIndicators = screening.riskIndicators;
    walletCheck.providerResult = screening.providerResult;
    walletCheck.feeStatus = 'CHARGED';
    walletCheck.ledgerReference = ledgerEntry.referenceRequestId;
    walletCheck.completedAt = new Date();
    await walletCheck.save();

    const newBalance = await BalanceLedger.calculateAvailableBalance(userId, 'USDT');

    return res.status(200).json({
      success: true,
      message: 'Wallet screening completed successfully.',
      data: walletCheck,
      newBalance,
    });
  } catch (error) {
    console.error('[createTraderWalletCheck Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to process wallet check request.',
    });
  }
};

/**
 * GET /api/trader/wallet-check/:id
 * Retrieve a single wallet check by ID
 */
const getTraderCheckById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const check = await WalletCheck.findOne({
      $and: [
        { userId },
        {
          $or: [
            { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null },
            { checkId: id },
          ].filter(Boolean),
        },
      ],
    });

    if (!check) {
      return res.status(404).json({
        success: false,
        message: 'Wallet check record not found.',
      });
    }

    return res.status(200).json({
      success: true,
      data: check,
    });
  } catch (error) {
    console.error('[getTraderCheckById Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve wallet check record.',
    });
  }
};

/**
 * GET /api/trader/wallet-check/:id/report
 * Detailed AML report for printing or modal
 */
const getTraderCheckReport = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const check = await WalletCheck.findOne({
      $and: [
        { userId },
        {
          $or: [
            { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null },
            { checkId: id },
          ].filter(Boolean),
        },
      ],
    });

    if (!check) {
      return res.status(404).json({
        success: false,
        message: 'Wallet check report not found.',
      });
    }

    const report = {
      reportId: `REP-${check.checkId}`,
      checkId: check.checkId,
      walletAddress: check.walletAddress,
      network: check.network,
      provider: check.provider,
      providerRequestId: check.providerRequestId,
      screeningDate: check.completedAt || check.createdAt,
      status: check.status,
      riskScore: check.riskScore,
      riskCategory: check.riskCategory,
      riskIndicators: check.riskIndicators || [],
      feeCharged: `${Number(check.feeAmount).toFixed(2)} ${check.feeCurrency}`,
      feeStatus: check.feeStatus,
      disclaimer:
        'Notice: This screening report reflects automated on-chain entity and heuristics analysis at the time of evaluation. It does not constitute legal or regulatory advice or an endorsement of counterparty legitimacy.',
    };

    return res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error) {
    console.error('[getTraderCheckReport Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate wallet check report.',
    });
  }
};

// ==========================================
// ADMIN CONTROLLERS
// ==========================================

/**
 * GET /api/admin/wallet-check
 * List all checks across all traders
 */
const getAllAdminWalletChecks = async (req, res) => {
  try {
    const { search, trader, network, status, page = 1, limit = 20 } = req.query;

    const query = {};

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [{ walletAddress: regex }, { checkId: regex }, { clientId: regex }];
    }

    if (trader && trader.trim() && trader !== 'ALL') {
      query.clientId = trader.trim();
    }

    if (network && network !== 'ALL') {
      query.network = network.toUpperCase();
    }

    if (status && status !== 'ALL') {
      query.status = status.toUpperCase();
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [checks, total] = await Promise.all([
      WalletCheck.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      WalletCheck.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: checks.map((c) => ({
        ...c,
        maskedAddress:
          c.walletAddress.length > 12
            ? `${c.walletAddress.slice(0, 6)}...${c.walletAddress.slice(-4)}`
            : c.walletAddress,
      })),
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    console.error('[getAllAdminWalletChecks Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve admin wallet check records.',
    });
  }
};

/**
 * GET /api/admin/wallet-check/:id
 * Retrieve single check for admin
 */
const getAdminCheckById = async (req, res) => {
  try {
    const { id } = req.params;

    const check = await WalletCheck.findOne({
      $or: [
        { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null },
        { checkId: id },
      ].filter(Boolean),
    });

    if (!check) {
      return res.status(404).json({
        success: false,
        message: 'Wallet check record not found.',
      });
    }

    return res.status(200).json({
      success: true,
      data: check,
    });
  } catch (error) {
    console.error('[getAdminCheckById Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve wallet check record.',
    });
  }
};

/**
 * GET /api/admin/wallet-check/settings
 * Retrieve full admin settings
 */
const getAdminSettings = async (req, res) => {
  try {
    const settings = await WalletCheckSettings.getOrCreateDefault();
    return res.status(200).json({
      success: true,
      data: {
        enabled: settings.enabled,
        feeAmount: settings.feeAmount,
        feeCurrency: settings.feeCurrency,
        supportedNetworks: settings.supportedNetworks,
        providerName: settings.providerName,
        providerApiKeyConfigured: Boolean(settings.providerApiKey),
        providerApiUrl: settings.providerApiUrl,
        dailyCheckLimit: settings.dailyCheckLimit,
        providerTimeout: settings.providerTimeout,
        sandboxMode: settings.sandboxMode,
      },
    });
  } catch (error) {
    console.error('[getAdminSettings Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve wallet check settings.',
    });
  }
};

/**
 * PATCH /api/admin/wallet-check/settings
 * Update admin settings
 */
const updateAdminSettings = async (req, res) => {
  try {
    const {
      enabled,
      feeAmount,
      supportedNetworks,
      providerName,
      providerApiKey,
      providerApiUrl,
      dailyCheckLimit,
      providerTimeout,
      sandboxMode,
    } = req.body;

    const settings = await WalletCheckSettings.getOrCreateDefault();

    if (enabled !== undefined) settings.enabled = Boolean(enabled);
    if (feeAmount !== undefined) {
      const numFee = parseFloat(feeAmount);
      if (isNaN(numFee) || numFee < 0) {
        return res.status(400).json({
          success: false,
          message: 'Fee amount must be a positive number.',
        });
      }
      settings.feeAmount = numFee;
    }
    if (Array.isArray(supportedNetworks)) {
      settings.supportedNetworks = supportedNetworks.map((n) => n.trim().toUpperCase());
    }
    if (providerName) settings.providerName = providerName.trim();
    if (providerApiKey !== undefined) settings.providerApiKey = providerApiKey.trim();
    if (providerApiUrl !== undefined) settings.providerApiUrl = providerApiUrl.trim();
    if (dailyCheckLimit !== undefined) {
      const numLimit = parseInt(dailyCheckLimit, 10);
      if (numLimit > 0) settings.dailyCheckLimit = numLimit;
    }
    if (providerTimeout !== undefined) {
      const numTimeout = parseInt(providerTimeout, 10);
      if (numTimeout >= 3) settings.providerTimeout = numTimeout;
    }
    if (sandboxMode !== undefined) settings.sandboxMode = Boolean(sandboxMode);

    settings.updatedBy = req.user._id;
    await settings.save();

    // Log admin audit
    await AuditLog.create({
      userId: req.user._id,
      action: 'UPDATE_WALLET_CHECK_SETTINGS',
      details: `Updated Wallet Check settings: Fee=${settings.feeAmount} USDT, Enabled=${settings.enabled}, Provider=${settings.providerName}`,
      ipAddress: req.ip || '',
    });

    return res.status(200).json({
      success: true,
      message: 'Wallet Check settings updated successfully.',
      data: {
        enabled: settings.enabled,
        feeAmount: settings.feeAmount,
        feeCurrency: settings.feeCurrency,
        supportedNetworks: settings.supportedNetworks,
        providerName: settings.providerName,
        providerApiKeyConfigured: Boolean(settings.providerApiKey),
        providerApiUrl: settings.providerApiUrl,
        dailyCheckLimit: settings.dailyCheckLimit,
        providerTimeout: settings.providerTimeout,
        sandboxMode: settings.sandboxMode,
      },
    });
  } catch (error) {
    console.error('[updateAdminSettings Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to update wallet check settings.',
    });
  }
};

/**
 * GET /api/admin/wallet-check/statistics
 * Aggregated statistics for admin dashboard
 */
const getAdminStatistics = async (req, res) => {
  try {
    const [totalChecks, completedChecks, failedChecks, highRiskChecks] = await Promise.all([
      WalletCheck.countDocuments(),
      WalletCheck.countDocuments({ status: 'COMPLETED' }),
      WalletCheck.countDocuments({ status: 'FAILED' }),
      WalletCheck.countDocuments({ riskCategory: { $in: ['HIGH_RISK', 'CRITICAL_RISK'] } }),
    ]);

    const feeAgg = await WalletCheck.aggregate([
      { $match: { feeStatus: 'CHARGED' } },
      { $group: { _id: null, totalFees: { $sum: '$feeAmount' } } },
    ]);

    const totalFeesCollected = feeAgg[0]?.totalFees || 0;

    return res.status(200).json({
      success: true,
      data: {
        totalChecks,
        completedChecks,
        failedChecks,
        highRiskChecks,
        totalFeesCollected,
      },
    });
  } catch (error) {
    console.error('[getAdminStatistics Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve wallet check statistics.',
    });
  }
};

module.exports = {
  // Trader
  getTraderSettings,
  getTraderHistory,
  createTraderWalletCheck,
  getTraderCheckById,
  getTraderCheckReport,
  // Admin
  getAllAdminWalletChecks,
  getAdminCheckById,
  getAdminSettings,
  updateAdminSettings,
  getAdminStatistics,
};
