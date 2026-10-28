const express = require('express');
const router = express.Router();
const {
  createPayIn,
  getMyPayIns,
  submitPayInReference,
  getAllPayInsAdmin,
  adminReviewPayIn,
} = require('../controllers/payinController');
const { requireAuth, requireAdmin, requireClient, requirePasswordChanged } = require('../middleware/auth');

// Client endpoints
router.post('/', requireAuth, requireClient, requirePasswordChanged, createPayIn);
router.get('/my', requireAuth, requireClient, getMyPayIns);
router.post('/:id/submit-reference', requireAuth, requireClient, requirePasswordChanged, submitPayInReference);

// Admin endpoints
router.get('/admin', requireAuth, requireAdmin, getAllPayInsAdmin);
router.patch('/admin/:id/review', requireAuth, requireAdmin, adminReviewPayIn);

module.exports = router;
