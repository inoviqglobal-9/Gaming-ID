const WalletRateConfig = require('../models/WalletRateConfig');
const AuditLog = require('../models/AuditLog');

// GET /api/admin/wallet-rate and /api/trader/wallet-rate
const getWalletValuationRate = async (req, res) => {
  try {
    const rateDoc = await WalletRateConfig.getActiveRate();
    return res.status(200).json({
      success: true,
      data: {
        key: rateDoc.key,
        rateINRPerUSDT: rateDoc.rateINRPerUSDT,
        formattedRate: Number(rateDoc.rateINRPerUSDT).toFixed(2),
        version: rateDoc.version,
        updatedBy: rateDoc.updatedBy,
        updatedByUsername: rateDoc.updatedByUsername || (rateDoc.updatedBy ? rateDoc.updatedBy.username : 'SYSTEM'),
        updatedAt: rateDoc.updatedAt,
        changeReason: rateDoc.changeReason,
        auditHistory: rateDoc.auditHistory || [],
      },
    });
  } catch (error) {
    console.error('[getWalletValuationRate Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve USDT valuation rate configuration.',
    });
  }
};

// PATCH /api/admin/wallet-rate & PUT /api/admin/wallet-rate
const updateWalletValuationRate = async (req, res) => {
  try {
    const { newRate, changeReason } = req.body;

    // 1. Validation checks
    if (newRate === undefined || newRate === null || newRate === '') {
      return res.status(400).json({
        success: false,
        message: 'New USDT valuation rate is required.',
      });
    }

    const numRate = Number(newRate);
    if (isNaN(numRate) || !isFinite(numRate)) {
      return res.status(400).json({
        success: false,
        message: 'USDT valuation rate must be a valid number.',
      });
    }

    if (numRate <= 0) {
      return res.status(400).json({
        success: false,
        message: 'USDT valuation rate must be greater than zero.',
      });
    }

    if (numRate < 1 || numRate > 100000) {
      return res.status(400).json({
        success: false,
        message: 'USDT valuation rate must be between ₹1 and ₹100,000.',
      });
    }

    // Check excessive decimal precision (max 4 decimal places)
    const rateString = String(newRate).trim();
    if (rateString.includes('.')) {
      const decimals = rateString.split('.')[1];
      if (decimals && decimals.length > 4) {
        return res.status(400).json({
          success: false,
          message: 'Rate cannot have more than 4 decimal places.',
        });
      }
    }

    if (changeReason && typeof changeReason === 'string' && changeReason.length > 500) {
      return res.status(400).json({
        success: false,
        message: 'Change reason cannot exceed 500 characters.',
      });
    }

    // 2. Fetch current doc to get previous rate for audit
    const currentDoc = await WalletRateConfig.getActiveRate();
    const previousRate = currentDoc ? currentDoc.rateINRPerUSDT : 105.00;

    // 3. Update rate in MongoDB
    const updatedDoc = await WalletRateConfig.updateRate({
      newRate: numRate,
      changeReason,
      user: req.user,
    });

    // 4. Record Admin audit log
    await AuditLog.log({
      action: 'USDT_VALUATION_RATE_UPDATED',
      user: req.user,
      ipAddress: req.ip || '',
      userAgent: req.get('User-Agent') || '',
      details: {
        previousRate,
        newRate: numRate,
        version: updatedDoc.version,
        changeReason: updatedDoc.changeReason,
      },
    });

    // 5. Broadcast real-time Socket.IO notification to all connected sessions
    try {
      const io = req.app.get('io');
      if (io) {
        const payload = {
          rateINRPerUSDT: updatedDoc.rateINRPerUSDT,
          valuationRate: Number(updatedDoc.rateINRPerUSDT).toFixed(2),
          version: updatedDoc.version,
          updatedAt: updatedDoc.updatedAt,
          changeReason: updatedDoc.changeReason,
          updatedBy: req.user ? req.user.username : 'ADMIN',
        };
        io.emit('wallet_rate_updated', payload);
        io.emit('usdt_rate_updated', payload);
      }
    } catch (socketErr) {
      console.warn('[WalletRate Socket Broadcast Error]:', socketErr.message);
    }

    return res.status(200).json({
      success: true,
      message: `USDT valuation rate updated to ₹${Number(numRate).toFixed(2)} and published successfully.`,
      data: {
        key: updatedDoc.key,
        rateINRPerUSDT: updatedDoc.rateINRPerUSDT,
        formattedRate: Number(updatedDoc.rateINRPerUSDT).toFixed(2),
        version: updatedDoc.version,
        updatedBy: updatedDoc.updatedBy,
        updatedByUsername: updatedDoc.updatedByUsername || req.user.username,
        updatedAt: updatedDoc.updatedAt,
        changeReason: updatedDoc.changeReason,
        auditHistory: updatedDoc.auditHistory || [],
      },
    });
  } catch (error) {
    console.error('[updateWalletValuationRate Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to update USDT valuation rate.',
    });
  }
};

module.exports = {
  getWalletValuationRate,
  updateWalletValuationRate,
};

