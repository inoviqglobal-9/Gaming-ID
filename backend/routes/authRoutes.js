const express = require('express');
const router = express.Router();
const { login, adminLogin, traderLogin, getMe, logout, changePassword } = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimiter');

// Rate limited login endpoints
router.post('/login', loginLimiter, login);
router.post('/admin/login', loginLimiter, adminLogin);
router.post('/trader/login', loginLimiter, traderLogin);

// Authenticated session validation & user profile
router.get('/me', requireAuth, getMe);

// Server-side logout and session destruction
router.post('/logout', requireAuth, logout);

// Change password
router.post('/change-password', requireAuth, changePassword);

module.exports = router;
