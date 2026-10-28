const express = require('express');
const router = express.Router();
const {
  createPayout,
  getMyPayouts,
  getAllPayoutsAdmin,
  adminReviewPayout,
} = require('../controllers/payoutController');
const { requireAuth, requireAdmin, requireClient, requirePasswordChanged } = require('../middleware/auth');

// Client endpoints
router.post('/', requireAuth, requireClient, requirePasswordChanged, createPayout);
router.get('/my', requireAuth, requireClient, getMyPayouts);

// Admin review endpoints
router.get('/admin', requireAuth, requireAdmin, getAllPayoutsAdmin);
router.patch('/admin/:id/review', requireAuth, requireAdmin, adminReviewPayout);

module.exports = router;
