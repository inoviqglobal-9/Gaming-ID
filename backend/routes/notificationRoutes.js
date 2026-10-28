const express = require('express');
const router = express.Router();
const {
  getMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} = require('../controllers/notificationController');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, getMyNotifications);
router.patch('/mark-all-read', requireAuth, markAllNotificationsRead);
router.patch('/:id/read', requireAuth, markNotificationRead);

module.exports = router;
