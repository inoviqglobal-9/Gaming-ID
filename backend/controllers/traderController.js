const PayInRequest = require('../models/PayInRequest');
const PayoutRequest = require('../models/PayoutRequest');
const BalanceLedger = require('../models/BalanceLedger');
const UsdtWallet = require('../models/UsdtWallet');

// Helper to calculate date range
const getRangeDates = (period = '7D') => {
  const days = period === '30D' ? 30 : 7;
  const now = new Date();
  const startDate = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  startDate.setHours(0, 0, 0, 0);
  return { startDate, days };
};

// GET /api/trader/dashboard/summary
const getDashboardSummary = async (req, res) => {
  const { period = '7D' } = req.query;
  const { startDate } = getRangeDates(period);
  const userId = req.user._id;

  try {
    const [inrBalance, usdtWallet, payIns, payouts] = await Promise.all([
      BalanceLedger.calculateAvailableBalance(userId, 'INR'),
      UsdtWallet.syncWithLedger(userId),
      PayInRequest.find({ userId, createdAt: { $gte: startDate } }),
      PayoutRequest.find({ userId, createdAt: { $gte: startDate } }),
    ]);

    const normalValuation = await usdtWallet.toSubledgerValuation('NORMAL');
    const usdtBalance = parseFloat(normalValuation.availableBalance) || 0.0;
    const securityDepositBalance = parseFloat(normalValuation.securityDepositBalance) || 0.0;

    // PayIn Statistics
    const confirmedPayIns = payIns.filter((p) =>
      ['CONFIRMED', 'DEMO_TRANSACTION'].includes(p.status)
    );
    const payInVolume = confirmedPayIns.reduce((sum, p) => sum + (p.amount || 0), 0);
    const payInCount = confirmedPayIns.length;
    const payInTotal = payIns.length;
    const payInSuccessRate =
      payInTotal > 0 ? Math.round((payInCount / payInTotal) * 100) : 0;

    // PayOut Statistics
    const completedPayouts = payouts.filter((p) =>
      ['COMPLETED', 'APPROVED'].includes(p.status)
    );
    const payOutVolume = completedPayouts.reduce((sum, p) => sum + (p.amount || 0), 0);
    const payOutCount = completedPayouts.length;
    const payOutTotal = payouts.length;
    const payOutSuccessRate =
      payOutTotal > 0 ? Math.round((payOutCount / payOutTotal) * 100) : 0;

    // Overall Totals
    const totalVolume = payInVolume + payOutVolume;
    const totalTransactions = payInTotal + payOutTotal;
    const totalConfirmed = payInCount + payOutCount;
    const successRate =
      totalTransactions > 0
        ? Math.round((totalConfirmed / totalTransactions) * 100)
        : 0;

    return res.status(200).json({
      success: true,
      data: {
        period,
        balance: {
          inr: inrBalance,
          usdt: usdtBalance,
          securityDeposit: securityDepositBalance,
        },
        totalVolume,
        totalTransactions,
        totalConfirmed,
        successRate,
        payIn: {
          volume: payInVolume,
          count: payInCount,
          total: payInTotal,
          successRate: payInSuccessRate,
        },
        payOut: {
          volume: payOutVolume,
          count: payOutCount,
          total: payOutTotal,
          successRate: payOutSuccessRate,
        },
      },
    });
  } catch (error) {
    console.error('[Trader getDashboardSummary Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to aggregate dashboard summary.',
    });
  }
};

// GET /api/trader/dashboard/volume
const getDashboardVolume = async (req, res) => {
  const { period = '7D' } = req.query;
  const { startDate, days } = getRangeDates(period);
  const userId = req.user._id;

  try {
    const [payIns, payouts] = await Promise.all([
      PayInRequest.find({
        userId,
        createdAt: { $gte: startDate },
        status: { $in: ['CONFIRMED', 'DEMO_TRANSACTION'] },
      }),
      PayoutRequest.find({
        userId,
        createdAt: { $gte: startDate },
        status: { $in: ['COMPLETED', 'APPROVED'] },
      }),
    ]);

    // Build day map
    const dayMap = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const key = d.toISOString().slice(0, 10);
      dayMap[key] = { date: label, payIn: 0, payOut: 0 };
    }

    payIns.forEach((p) => {
      const key = new Date(p.createdAt).toISOString().slice(0, 10);
      if (dayMap[key]) {
        dayMap[key].payIn += p.amount || 0;
      }
    });

    payouts.forEach((p) => {
      const key = new Date(p.createdAt).toISOString().slice(0, 10);
      if (dayMap[key]) {
        dayMap[key].payOut += p.amount || 0;
      }
    });

    const series = Object.values(dayMap);

    return res.status(200).json({
      success: true,
      data: series,
    });
  } catch (error) {
    console.error('[Trader getDashboardVolume Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to aggregate volume series.',
    });
  }
};

// GET /api/trader/dashboard/transaction-status
const getTransactionStatus = async (req, res) => {
  const { period = '7D' } = req.query;
  const { startDate } = getRangeDates(period);
  const userId = req.user._id;

  try {
    const [payIns, payouts] = await Promise.all([
      PayInRequest.find({ userId, createdAt: { $gte: startDate } }),
      PayoutRequest.find({ userId, createdAt: { $gte: startDate } }),
    ]);

    let confirmed = 0;
    let pending = 0;
    let declined = 0;
    let expired = 0;

    payIns.forEach((p) => {
      if (['CONFIRMED', 'DEMO_TRANSACTION'].includes(p.status)) confirmed++;
      else if (['PENDING', 'SUBMITTED', 'PENDING_VERIFICATION', 'UNDER_REVIEW'].includes(p.status)) pending++;
      else if (['REJECTED'].includes(p.status)) declined++;
      else if (['EXPIRED'].includes(p.status)) expired++;
    });

    payouts.forEach((p) => {
      if (['COMPLETED', 'APPROVED'].includes(p.status)) confirmed++;
      else if (['PENDING', 'UNDER_REVIEW', 'PROCESSING'].includes(p.status)) pending++;
      else if (['REJECTED', 'FAILED', 'CANCELLED'].includes(p.status)) declined++;
    });

    const total = confirmed + pending + declined + expired;

    const breakdown = [
      {
        status: 'Confirmed',
        count: confirmed,
        percentage: total > 0 ? Math.round((confirmed / total) * 100) : 0,
        color: '#10B981', // Emerald green
      },
      {
        status: 'Pending',
        count: pending,
        percentage: total > 0 ? Math.round((pending / total) * 100) : 0,
        color: '#F59E0B', // Amber
      },
      {
        status: 'Declined',
        count: declined,
        percentage: total > 0 ? Math.round((declined / total) * 100) : 0,
        color: '#EF4444', // Red
      },
      {
        status: 'Expired',
        count: expired,
        percentage: total > 0 ? Math.round((expired / total) * 100) : 0,
        color: '#6B7280', // Gray
      },
    ];

    return res.status(200).json({
      success: true,
      data: {
        total,
        breakdown,
      },
    });
  } catch (error) {
    console.error('[Trader getTransactionStatus Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to aggregate status breakdown.',
    });
  }
};

// GET /api/trader/dashboard/recent-applications
const getRecentApplications = async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 10;
  const userId = req.user._id;

  try {
    const payIns = await PayInRequest.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit);

    const applications = payIns.map((p) => ({
      applicationId: p.requestId,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      merchant: p.merchantName || 'Authorized Merchant',
      created: p.createdAt,
    }));

    return res.status(200).json({
      success: true,
      data: applications,
    });
  } catch (error) {
    console.error('[Trader getRecentApplications Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch recent applications.',
    });
  }
};

module.exports = {
  getDashboardSummary,
  getDashboardVolume,
  getTransactionStatus,
  getRecentApplications,
};
