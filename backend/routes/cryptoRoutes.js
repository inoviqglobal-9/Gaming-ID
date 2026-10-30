const express = require('express');
const router = express.Router();
const {
  getCryptoRates,
  getQuotation,
  getWithdrawalConfig,
  getActiveDepositQR,
  streamActiveQR,
  createDepositRequest,
  getTraderDeposits,
  createWithdrawalRequest,
  getTraderWithdrawals,
  getTraderCryptoTransactions,
  getTraderCryptoWallet,
  getAdminCryptoOverview,
  getAdminDeposits,
  approveDeposit,
  rejectDeposit,
  getAdminWithdrawals,
  getWithdrawalById,
  approveWithdrawal,
  verifyAndCompleteWithdrawal,
  rejectWithdrawal,
  getAdminQRs,
  uploadAdminQR,
  setActiveQR,
  deleteAdminQR,
  getAdminCryptoTransactions,
  getAdminCryptoActivities,
  getCryptoSettings,
  updateCryptoSettings,
  getCryptoSettingsHistory,
  // Legacy
  getCryptoConfig,
  createCryptoRequest,
  getMyCryptoRequests,
  getAllCryptoAdmin,
  adminReviewCrypto,
} = require('../controllers/cryptoController');

const { requireAuth, requireAdmin, requireClient, requirePasswordChanged } = require('../middleware/auth');
const {
  uploadCryptoAdminQr,
  uploadCryptoProof,
  uploadCryptoTraderQr,
} = require('../middleware/upload');

// Public / Authenticated Rates and Active QR
router.get('/rates', getCryptoRates);
router.get('/settings', getCryptoSettings);
router.get('/quote', getQuotation);
router.get('/withdrawal-config', getWithdrawalConfig);
router.get('/deposit-qr', getActiveDepositQR);
router.get('/live-qr-stream', streamActiveQR);
router.get('/config', requireAuth, getCryptoConfig);

// Trader Crypto Endpoints
router.post(
  '/deposits',
  requireAuth,
  requireClient,
  uploadCryptoProof.single('proofImage'),
  createDepositRequest
);
router.get('/deposits', requireAuth, requireClient, getTraderDeposits);

router.post(
  '/withdrawals',
  requireAuth,
  requireClient,
  uploadCryptoTraderQr.single('traderQrImage'),
  createWithdrawalRequest
);
router.get('/withdrawals', requireAuth, requireClient, getTraderWithdrawals);
router.get('/withdrawals/my', requireAuth, requireClient, getTraderWithdrawals);
router.get('/transactions', requireAuth, requireClient, getTraderCryptoTransactions);
router.get('/wallet', requireAuth, requireClient, getTraderCryptoWallet);

// Trader Legacy routes
router.post('/request', requireAuth, requireClient, requirePasswordChanged, createCryptoRequest);
router.get('/my', requireAuth, requireClient, getMyCryptoRequests);

// Admin Crypto Endpoints
router.get('/admin/overview', requireAuth, requireAdmin, getAdminCryptoOverview);
router.get('/admin/settings', requireAuth, requireAdmin, getCryptoSettings);
router.patch('/admin/settings', requireAuth, requireAdmin, updateCryptoSettings);
router.get('/admin/settings/history', requireAuth, requireAdmin, getCryptoSettingsHistory);

// Admin Deposit Requests
router.get('/admin/deposits', requireAuth, requireAdmin, getAdminDeposits);
router.post('/admin/deposits/:id/approve', requireAuth, requireAdmin, approveDeposit);
router.post('/admin/deposits/:id/reject', requireAuth, requireAdmin, rejectDeposit);

// Admin Withdrawal Requests (Both /admin/withdrawals and nested paths)
router.get('/admin/withdrawals', requireAuth, requireAdmin, getAdminWithdrawals);
router.get('/admin/withdrawals/:id', requireAuth, requireAdmin, getWithdrawalById);
router.patch('/admin/withdrawals/:id/approve', requireAuth, requireAdmin, approveWithdrawal);
router.post('/admin/withdrawals/:id/approve', requireAuth, requireAdmin, approveWithdrawal);
router.patch('/admin/withdrawals/:id/reject', requireAuth, requireAdmin, rejectWithdrawal);
router.post('/admin/withdrawals/:id/reject', requireAuth, requireAdmin, rejectWithdrawal);
router.patch('/admin/withdrawals/:id/complete', requireAuth, requireAdmin, verifyAndCompleteWithdrawal);
router.post('/admin/withdrawals/:id/complete', requireAuth, requireAdmin, verifyAndCompleteWithdrawal);
router.post('/admin/withdrawals/:id/verify-payout', requireAuth, requireAdmin, verifyAndCompleteWithdrawal);

// Admin QR Management
router.get('/admin/qrs', requireAuth, requireAdmin, getAdminQRs);
router.post(
  '/admin/qrs',
  requireAuth,
  requireAdmin,
  uploadCryptoAdminQr.single('qrImage'),
  uploadAdminQR
);
router.patch('/admin/qrs/:id/active', requireAuth, requireAdmin, setActiveQR);
router.delete('/admin/qrs/:id', requireAuth, requireAdmin, deleteAdminQR);

// Admin Unified Transactions & Activities
router.get('/admin/transactions', requireAuth, requireAdmin, getAdminCryptoTransactions);
router.get('/admin/activities', requireAuth, requireAdmin, getAdminCryptoActivities);

// Admin Legacy routes
router.get('/admin', requireAuth, requireAdmin, getAllCryptoAdmin);
router.patch('/admin/:id/review', requireAuth, requireAdmin, adminReviewCrypto);

module.exports = router;
