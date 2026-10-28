const express = require('express');
const router = express.Router();
const {
  getDashboardSummary,
  getDashboardVolume,
  getTransactionStatus,
  getRecentApplications,
} = require('../controllers/traderController');
const {
  getTraderPayoutSettings,
  getTraderActivePayout,
  getTraderPayoutHistory,
  claimTraderPayout,
  exportTraderPayoutHistoryCsv,
} = require('../controllers/payoutController');
const {
  getTraderApplications,
  getTraderApplicationById,
  exportTraderApplicationsCsv,
} = require('../controllers/applicationController');
const {
  getTraderDepositSettings,
  getTraderDepositRequests,
  createTraderDepositRequest,
  getTraderDepositRequestById,
  submitTraderDepositEvidence,
} = require('../controllers/depositController');
const { uploadDepositEvidence } = require('../middleware/upload');
const { requireAuth, requireTrader } = require('../middleware/auth');

// All trader endpoints require authenticated Trader/Client role
router.use(requireAuth, requireTrader);

// Dashboard endpoints
router.get('/dashboard/summary', getDashboardSummary);
router.get('/dashboard/volume', getDashboardVolume);
router.get('/dashboard/transaction-status', getTransactionStatus);
router.get('/dashboard/recent-applications', getRecentApplications);

// Trader USDT Wallet endpoints (Phase 13 & 14)
const {
  getTraderUsdtWallet,
  getTraderUsdtTransactions,
} = require('../controllers/usdtWalletController');
const { getMyNotifications } = require('../controllers/notificationController');

router.get('/wallet/usdt', getTraderUsdtWallet);
router.get('/wallet/transactions', getTraderUsdtTransactions);
router.get('/notifications', getMyNotifications);

// Trader Applications (PayIn) endpoints
router.get('/applications', getTraderApplications);
router.get('/applications/export', exportTraderApplicationsCsv);
router.get('/applications/:id', getTraderApplicationById);

// Trader Payout endpoints
router.get('/payouts/settings', getTraderPayoutSettings);
router.get('/payouts/active', getTraderActivePayout);
router.get('/payouts/history', getTraderPayoutHistory);
router.post('/payouts/:id/claim', claimTraderPayout);
router.get('/payouts/history/export', exportTraderPayoutHistoryCsv);

// Trader Deposit Requests endpoints
router.get('/deposit-settings', getTraderDepositSettings);
router.get('/deposit-requests', getTraderDepositRequests);
router.post('/deposit-requests', createTraderDepositRequest);
router.get('/deposit-requests/:id', getTraderDepositRequestById);
router.post(
  '/deposit-requests/:id/submit-evidence',
  uploadDepositEvidence.single('screenshot'),
  submitTraderDepositEvidence
);

// Trader Requisites endpoints
const {
  getTraderRequisitesSummary,
  getTraderRequisites,
  createTraderRequisite,
  getTraderRequisiteById,
  updateTraderRequisite,
  toggleTraderPayIn,
  getTraderRequisiteStatistics,
} = require('../controllers/requisiteController');

router.get('/requisites/summary', getTraderRequisitesSummary);
router.get('/requisites', getTraderRequisites);
router.post('/requisites', createTraderRequisite);
router.get('/requisites/:id', getTraderRequisiteById);
router.patch('/requisites/:id', updateTraderRequisite);
router.patch('/requisites/:id/payin', toggleTraderPayIn);
router.get('/requisites/:id/statistics', getTraderRequisiteStatistics);

// Trader Wallet Check (AML Screening) endpoints
const {
  getTraderSettings: getTraderWalletCheckSettings,
  getTraderHistory: getTraderWalletCheckHistory,
  createTraderWalletCheck,
  getTraderCheckById,
  getTraderCheckReport,
} = require('../controllers/walletCheckController');

router.get('/wallet-check/settings', getTraderWalletCheckSettings);
router.get('/wallet-check/history', getTraderWalletCheckHistory);
router.post('/wallet-check', createTraderWalletCheck);
router.get('/wallet-check/:id', getTraderCheckById);
router.get('/wallet-check/:id/report', getTraderCheckReport);

module.exports = router;


