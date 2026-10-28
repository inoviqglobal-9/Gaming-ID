const crypto = require('crypto');
const Session = require('../models/Session');
const User = require('../models/User');
const { config } = require('../config/env');

const hashToken = (token) => {
  return crypto.createHash('sha256').update(token + config.sessionSecret).digest('hex');
};

const requireAuth = async (req, res, next) => {
  try {
    let authHeaderToken = null;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      authHeaderToken = req.headers.authorization.split(' ')[1];
    }
    const cookieToken = req.cookies ? req.cookies[config.cookieName] : null;

    // Prefer header token (explicit from client), fallback to cookie
    const token = authHeaderToken || cookieToken;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
      });
    }

    let tokenHash = hashToken(token);
    let session = await Session.findOne({
      tokenHash,
      isRevoked: false,
      expiresAt: { $gt: new Date() },
    });

    // If header token lookup failed but cookie exists and is different, fallback to cookie session
    if (!session && authHeaderToken && cookieToken && authHeaderToken !== cookieToken) {
      tokenHash = hashToken(cookieToken);
      session = await Session.findOne({
        tokenHash,
        isRevoked: false,
        expiresAt: { $gt: new Date() },
      });
    }

    if (!session) {
      res.clearCookie(config.cookieName, {
        httpOnly: true,
        secure: config.isProduction,
        sameSite: 'lax',
        path: '/',
      });
      res.clearCookie('scanner_trader_has_session', {
        path: '/',
      });
      return res.status(401).json({
        success: false,
        message: 'Session has expired or was revoked. Please log in again.',
      });
    }

    const user = await User.findById(session.userId);
    if (!user) {
      await Session.revokeAllUserSessions(session.userId, 'User record not found');
      return res.status(401).json({
        success: false,
        message: 'Account no longer exists.',
      });
    }

    if (user.status === 'SUSPENDED') {
      await Session.revokeAllUserSessions(user._id, 'Account suspended by administrator');
      res.clearCookie(config.cookieName, {
        httpOnly: true,
        secure: config.isProduction,
        sameSite: 'lax',
        path: '/',
      });
      res.clearCookie('scanner_trader_has_session', {
        path: '/',
      });
      return res.status(403).json({
        success: false,
        message: 'Your account is suspended. Protected access is denied.',
      });
    }

    if (user.status === 'DEACTIVATED') {
      await Session.revokeAllUserSessions(user._id, 'Account deactivated');
      res.clearCookie(config.cookieName, {
        httpOnly: true,
        secure: config.isProduction,
        sameSite: 'lax',
        path: '/',
      });
      res.clearCookie('scanner_trader_has_session', {
        path: '/',
      });
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated.',
      });
    }

    req.user = user;
    req.session = session;
    next();
  } catch (error) {
    console.error('[Auth Middleware Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Internal server error verifying session.',
    });
  }
};

const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      message: 'Access denied: Admin privileges required.',
    });
  }
  next();
};

const requireClient = (req, res, next) => {
  if (!req.user || (req.user.role !== 'CLIENT' && req.user.role !== 'TRADER')) {
    return res.status(403).json({
      success: false,
      message: 'Access restricted to trader and client accounts.',
    });
  }
  next();
};

const requireTrader = requireClient;

// Optional middleware: First-login password change is no longer mandatory.
// Direct login with permanent credentials is enabled for all clients.
const requirePasswordChanged = (req, res, next) => {
  next();
};

module.exports = {
  hashToken,
  requireAuth,
  requireAdmin,
  requireClient,
  requireTrader,
  requirePasswordChanged,
};
