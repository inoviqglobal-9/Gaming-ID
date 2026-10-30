const express = require('express');
const router = express.Router();
const {
  getClients,
  getClientById,
  createClient,
  updateClient,
  bulkGenerateUsers,
  updateClientStatus,
  resetClientPassword,
  revokeClientSessions,
  exportClientsCsv,
  getAdminAnalytics,
  deleteClient,
} = require('../controllers/adminController');
const {
  getAllPayoutsAdmin,
  getAdminPayoutById,
  adminAssignPayout,
  adminReviewPayout,
  adminGetTraderPayoutSettings,
  adminUpdateTraderPayoutSettings,
} = require('../controllers/payoutController');
const {
  getAllApplicationsAdmin,
  getApplicationByIdAdmin,
  adminReviewApplication,
  exportApplicationsAdminCsv,
  getApplicationHistoryAdmin,
} = require('../controllers/applicationController');
const {
  getAllDepositsAdmin,
  getAdminDepositById,
  adminReviewDeposit,
  getAdminDepositSettings,
  updateAdminDepositSettings,
} = require('../controllers/depositController');
const {
  getWalletValuationRate,
  updateWalletValuationRate,
} = require('../controllers/walletRateController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// All admin routes require authenticated Admin role
router.use(requireAuth, requireAdmin);

// Client & Trader management routes
router.get('/clients/export-csv', exportClientsCsv);
router.get('/clients', getClients);
router.post('/clients', createClient);
router.get('/clients/:id', getClientById);
router.patch('/clients/:id', updateClient);
router.patch('/clients/:id/status', updateClientStatus);
router.post('/clients/:id/reset-password', resetClientPassword);
router.post('/clients/:id/revoke-sessions', revokeClientSessions);
router.delete('/clients/:id', deleteClient);

// Explicit /traders aliases
router.get('/traders/export-csv', exportClientsCsv);
router.get('/traders', getClients);
router.post('/traders', createClient);
router.get('/traders/:id', getClientById);
router.patch('/traders/:id', updateClient);
router.patch('/traders/:id/status', updateClientStatus);
router.post('/traders/:id/reset-password', resetClientPassword);
router.post('/traders/:id/revoke-sessions', revokeClientSessions);
router.delete('/traders/:id', deleteClient);

router.post('/generate-users', bulkGenerateUsers);
router.get('/analytics', getAdminAnalytics);

// USDT Wallet Management & Adjustment Endpoints (Phase 6, 7, 8, 10, 13)
const {
  getAdminTraderUsdtWallet,
  getAdminTraderTransactions,
  createWalletAdjustment,
  getWalletAdjustments,
  approveWalletAdjustment,
  rejectWalletAdjustment,
  getAdminActivities,
} = require('../controllers/usdtWalletController');

router.get('/traders/:id/wallet/usdt', getAdminTraderUsdtWallet);
router.get('/clients/:id/wallet/usdt', getAdminTraderUsdtWallet);
router.get('/traders/:id/transactions', getAdminTraderTransactions);
router.get('/clients/:id/transactions', getAdminTraderTransactions);
router.get('/activities', getAdminActivities);

router.get('/wallet-adjustments', getWalletAdjustments);
router.post('/wallet-adjustments', createWalletAdjustment);
router.post('/wallet-adjustments/:id/approve', approveWalletAdjustment);
router.post('/wallet-adjustments/:id/reject', rejectWalletAdjustment);

// USDT Wallet Valuation Rate Management (Admin controlled)
router.get('/wallet-rate', getWalletValuationRate);
router.patch('/wallet-rate', updateWalletValuationRate);
router.put('/wallet-rate', updateWalletValuationRate);

// Admin Payout Management
router.get('/payouts', getAllPayoutsAdmin);
router.get('/payouts/:id', getAdminPayoutById);
router.post('/payouts/assign', adminAssignPayout);
router.patch('/payouts/:id', adminReviewPayout);
router.patch('/payouts/:id/review', adminReviewPayout);
router.get('/traders/:id/payout-settings', adminGetTraderPayoutSettings);
router.patch('/traders/:id/payout-settings', adminUpdateTraderPayoutSettings);

// Admin Applications (PayIn) Management
router.get('/applications', getAllApplicationsAdmin);
router.get('/applications/export', exportApplicationsAdminCsv);
router.get('/applications/:id', getApplicationByIdAdmin);
router.patch('/applications/:id', adminReviewApplication);
router.get('/applications/:id/history', getApplicationHistoryAdmin);

// Admin Deposit Settings
router.get('/deposit-settings', getAdminDepositSettings);
router.patch('/deposit-settings', updateAdminDepositSettings);

// Admin Deposit Management
router.get('/deposit-requests', getAllDepositsAdmin);
router.get('/deposit-requests/:id', getAdminDepositById);
router.patch('/deposit-requests/:id', adminReviewDeposit);
router.patch('/deposit-requests/:id/review', adminReviewDeposit);

// Explicit POST actions for verification, approval, rejection
router.post('/deposit-requests/:id/verify', (req, res, next) => {
  req.body.action = 'UPDATE_VERIFICATION';
  req.body.verificationStatus = req.body.verificationStatus || 'VERIFIED';
  return adminReviewDeposit(req, res, next);
});
router.post('/deposit-requests/:id/approve', (req, res, next) => {
  req.body.action = 'APPROVE';
  return adminReviewDeposit(req, res, next);
});
router.post('/deposit-requests/:id/reject', (req, res, next) => {
  req.body.action = 'REJECT';
  req.body.rejectionReason = req.body.rejectionReason || req.body.reason;
  return adminReviewDeposit(req, res, next);
});

// Admin Requisites Management
const {
  getAllRequisitesAdmin,
  getAdminRequisiteById,
  adminApproveRequisite,
  adminRejectRequisite,
  adminUpdateRequisiteStatus,
  adminUpdateRequisiteLimits,
  adminUpdatePayInPermission,
  getAdminRequisiteSettings,
  updateAdminRequisiteSettings,
} = require('../controllers/requisiteController');

router.get('/requisite-settings', getAdminRequisiteSettings);
router.patch('/requisite-settings', updateAdminRequisiteSettings);

router.get('/requisites', getAllRequisitesAdmin);
router.get('/requisites/:id', getAdminRequisiteById);
router.post('/requisites/:id/approve', adminApproveRequisite);
router.post('/requisites/:id/reject', adminRejectRequisite);
router.patch('/requisites/:id/status', adminUpdateRequisiteStatus);
router.patch('/requisites/:id/limits', adminUpdateRequisiteLimits);
router.patch('/requisites/:id/payin-permission', adminUpdatePayInPermission);

// Admin Wallet Check (AML Screening) Management
const {
  getAllAdminWalletChecks,
  getAdminCheckById: getAdminWalletCheckById,
  getAdminSettings: getAdminWalletCheckSettings,
  updateAdminSettings: updateAdminWalletCheckSettings,
  getAdminStatistics: getAdminWalletCheckStatistics,
} = require('../controllers/walletCheckController');

router.get('/wallet-check/settings', getAdminWalletCheckSettings);
router.patch('/wallet-check/settings', updateAdminWalletCheckSettings);
router.get('/wallet-check/statistics', getAdminWalletCheckStatistics);
router.get('/wallet-check', getAllAdminWalletChecks);
router.get('/wallet-check/:id', getAdminWalletCheckById);

// Admin Crypto Deposit & Withdrawal Management (Task 10)
const {
  getAdminDeposits,
  approveDeposit,
  rejectDeposit,
  getAdminWithdrawals,
  getWithdrawalById,
  approveWithdrawal,
  verifyAndCompleteWithdrawal,
  rejectWithdrawal,
  getCryptoSettings,
  updateCryptoSettings,
  getCryptoSettingsHistory,
} = require('../controllers/cryptoController');

router.get('/crypto/settings', getCryptoSettings);
router.patch('/crypto/settings', updateCryptoSettings);
router.get('/crypto/settings/history', getCryptoSettingsHistory);

router.get('/crypto/deposits', getAdminDeposits);
router.post('/crypto/deposits/:id/approve', approveDeposit);
router.patch('/crypto/deposits/:id/approve', approveDeposit);
router.post('/crypto/deposits/:id/reject', rejectDeposit);
router.patch('/crypto/deposits/:id/reject', rejectDeposit);

router.get('/crypto/withdrawals', getAdminWithdrawals);
router.get('/crypto/withdrawals/:id', getWithdrawalById);
router.patch('/crypto/withdrawals/:id/approve', approveWithdrawal);
router.post('/crypto/withdrawals/:id/approve', approveWithdrawal);
router.patch('/crypto/withdrawals/:id/reject', rejectWithdrawal);
router.post('/crypto/withdrawals/:id/reject', rejectWithdrawal);
router.patch('/crypto/withdrawals/:id/complete', verifyAndCompleteWithdrawal);
router.post('/crypto/withdrawals/:id/complete', verifyAndCompleteWithdrawal);

module.exports = router;


