const express = require('express');
const router = express.Router();
const {
  createDeposit,
  getMyDeposits,
  getAllDepositsAdmin,
  adminReviewDeposit,
  getTraderDepositRequestById,
  submitTraderDepositEvidence,
  getTraderDepositSettings,
} = require('../controllers/depositController');
const { uploadDepositEvidence } = require('../middleware/upload');
const { requireAuth, requireAdmin, requireClient, requirePasswordChanged } = require('../middleware/auth');

// Client endpoints
router.get('/settings', requireAuth, getTraderDepositSettings);
router.post('/', requireAuth, requireClient, requirePasswordChanged, createDeposit);
router.get('/my', requireAuth, requireClient, getMyDeposits);
router.get('/:id', requireAuth, getTraderDepositRequestById);
router.get('/:id/payment-details', requireAuth, getTraderDepositRequestById);
router.post(
  '/:id/submit-evidence',
  requireAuth,
  uploadDepositEvidence.single('screenshot'),
  submitTraderDepositEvidence
);

// Admin review endpoints
router.get('/admin', requireAuth, requireAdmin, getAllDepositsAdmin);
router.patch('/admin/:id/review', requireAuth, requireAdmin, adminReviewDeposit);

module.exports = router;

