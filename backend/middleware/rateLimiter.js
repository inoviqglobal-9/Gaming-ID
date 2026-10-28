const rateLimit = require('express-rate-limit');
const { config } = require('../config/env');

// Rate limiting for sensitive login attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: config.isProduction ? 15 : 100, // 100 attempts in development, 15 in production
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many login attempts from this IP. Please try again after 15 minutes.',
  },
});

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.isProduction ? 600 : 5000, // 5000 in dev to support rapid automated audits
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please slow down.',
  },
});

module.exports = {
  loginLimiter,
  apiLimiter,
};
