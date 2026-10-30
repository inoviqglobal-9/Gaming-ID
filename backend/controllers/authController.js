const crypto = require('crypto');
const User = require('../models/User');
const Session = require('../models/Session');
const AuditLog = require('../models/AuditLog');
const BalanceLedger = require('../models/BalanceLedger');
const UsdtWallet = require('../models/UsdtWallet');
const { hashToken } = require('../middleware/auth');
const { config } = require('../config/env');

const SESSION_DURATION_HOURS = 24;

// POST /api/auth/login
const login = async (req, res) => {
  const { username, password } = req.body;
  const ipAddress = req.ip || req.connection?.remoteAddress || '';
  const userAgent = req.get('User-Agent') || '';

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: 'Both username and password are required.',
    });
  }

  try {
    const trimmedUser = username.trim().toLowerCase();
    const user = await User.findOne({ username: trimmedUser });

    // Generic error message if user not found
    if (!user) {
      await AuditLog.log({
        action: 'FAILED_LOGIN_ATTEMPT',
        targetUsername: trimmedUser,
        ipAddress,
        userAgent,
        details: { reason: 'User not found' },
      });
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. Please verify your username and password.',
      });
    }

    // Verify password with bcrypt
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await AuditLog.log({
        action: 'FAILED_LOGIN_ATTEMPT',
        user: { _id: user._id, username: user.username, role: user.role },
        ipAddress,
        userAgent,
        details: { reason: 'Incorrect password' },
      });
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. Please verify your username and password.',
      });
    }

    // Check account status
    if (user.status === 'SUSPENDED') {
      await AuditLog.log({
        action: 'SUSPENDED_LOGIN_BLOCKED',
        user: { _id: user._id, username: user.username, role: user.role },
        ipAddress,
        userAgent,
      });
      return res.status(403).json({
        success: false,
        message: 'Your account has been suspended by an administrator. Access is blocked.',
      });
    }

    if (user.status === 'DEACTIVATED') {
      return res.status(403).json({
        success: false,
        message: 'This account has been deactivated.',
      });
    }

    // Generate secure random session token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 60 * 60 * 1000);

    // Save session in database
    await Session.create({
      tokenHash,
      userId: user._id,
      username: user.username,
      role: user.role,
      ipAddress,
      userAgent,
      expiresAt,
    });

    // Update user last login
    user.lastLoginAt = new Date();
    await user.save();

    // Log success
    await AuditLog.log({
      action: 'USER_LOGIN',
      user: { _id: user._id, username: user.username, role: user.role },
      ipAddress,
      userAgent,
      details: { role: user.role },
    });

    // Set secure HTTP-only cookie
    res.cookie(config.cookieName, rawToken, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    });

    // Client-side session presence indicator (non-sensitive flag)
    res.cookie('scanner_trader_has_session', '1', {
      httpOnly: false,
      secure: config.isProduction,
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    });

    // Calculate initial balances for client and trader accounts
    let balances = { INR: 0.00, USDT: 0.00, securityDeposit: 0.00 };
    if (user.role === 'CLIENT' || user.role === 'TRADER') {
      const inrBalance = await BalanceLedger.calculateAvailableBalance(user._id, 'INR');
      const usdtWallet = await UsdtWallet.syncWithLedger(user._id);
      const usdtBalance = parseFloat(usdtWallet.availableBalance.toString()) || 0.0;
      const secBalance = parseFloat(usdtWallet.securityDepositBalance ? usdtWallet.securityDepositBalance.toString() : '0.000000') || 0.0;
      balances = { INR: inrBalance, USDT: usdtBalance, securityDeposit: secBalance };
    }

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      token: rawToken,
      user: {
        id: user._id,
        fullName: user.fullName || '',
        username: user.username,
        role: user.role,
        status: user.status,
        email: user.email || '',
        mobile: user.mobile || '',
        mustChangePassword: user.mustChangePassword,
        payoutEnabled: user.payoutEnabled !== false,
        lastLoginAt: user.lastLoginAt,
      },
      balances,
    });
  } catch (error) {
    console.error('[Login Controller Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Unable to login. Please try again.',
    });
  }
};

// POST /api/auth/admin/login (Admin specific login)
const adminLogin = async (req, res, next) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: 'Both username and password are required.',
    });
  }

  try {
    const trimmedUser = username.trim().toLowerCase();
    const user = await User.findOne({ username: trimmedUser });
    if (!user || user.role !== 'ADMIN') {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password.',
      });
    }

    // Call standard login
    return login(req, res, next);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Unable to login. Please try again.',
    });
  }
};

// POST /api/auth/trader/login (Trader specific login)
const traderLogin = async (req, res, next) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: 'Both username and password are required.',
    });
  }

  try {
    const trimmedUser = username.trim().toLowerCase();
    const user = await User.findOne({ username: trimmedUser });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password.',
      });
    }

    if (user.role !== 'TRADER' && user.role !== 'CLIENT') {
      return res.status(403).json({
        success: false,
        message: 'Access restricted to Trader portal.',
      });
    }

    if (user.status === 'SUSPENDED' || user.status === 'DEACTIVATED') {
      return res.status(403).json({
        success: false,
        message: 'Your account is inactive. Contact administrator.',
      });
    }

    // Call standard login
    return login(req, res, next);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Unable to login. Please try again.',
    });
  }
};

// GET /api/auth/me
const getMe = async (req, res) => {
  try {
    const user = req.user;
    let balances = { INR: 0.00, USDT: 0.00, securityDeposit: 0.00 };

    if (user.role === 'CLIENT' || user.role === 'TRADER') {
      const inrBalance = await BalanceLedger.calculateAvailableBalance(user._id, 'INR');
      const usdtWallet = await UsdtWallet.syncWithLedger(user._id);
      const usdtBalance = parseFloat(usdtWallet.availableBalance.toString()) || 0.0;
      const secBalance = parseFloat(usdtWallet.securityDepositBalance ? usdtWallet.securityDepositBalance.toString() : '0.000000') || 0.0;
      balances = { INR: inrBalance, USDT: usdtBalance, securityDeposit: secBalance };
    }

    return res.status(200).json({
      success: true,
      user: {
        id: user._id,
        fullName: user.fullName || '',
        username: user.username,
        role: user.role,
        status: user.status,
        email: user.email || '',
        mobile: user.mobile || '',
        mustChangePassword: user.mustChangePassword,
        payoutEnabled: user.payoutEnabled !== false,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
      },
      balances,
    });
  } catch (error) {
    console.error('[getMe Controller Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve session profile.',
    });
  }
};

// POST /api/auth/logout
const logout = async (req, res) => {
  try {
    if (req.session) {
      req.session.isRevoked = true;
      req.session.revokedReason = 'User requested logout';
      await req.session.save();
    }

    await AuditLog.log({
      action: 'USER_LOGOUT',
      user: req.user,
      ipAddress: req.ip || '',
      userAgent: req.get('User-Agent') || '',
    });

    res.clearCookie(config.cookieName, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax',
      path: '/',
    });
    res.clearCookie('scanner_trader_has_session', {
      path: '/',
    });

    return res.status(200).json({
      success: true,
      message: 'Successfully logged out.',
    });
  } catch (error) {
    console.error('[Logout Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to log out.',
    });
  }
};

// POST /api/auth/change-password
const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      message: 'Current password and new password are required.',
    });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({
      success: false,
      message: 'New password must be at least 8 characters long.',
    });
  }

  try {
    const user = await User.findById(req.user._id);
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'The current password you provided is incorrect.',
      });
    }

    user.passwordHash = await User.hashPassword(newPassword);
    user.mustChangePassword = false;
    await user.save();

    // Revoke previous sessions for security, except current session
    await Session.updateMany(
      { userId: user._id, _id: { $ne: req.session._id }, isRevoked: false },
      { $set: { isRevoked: true, revokedReason: 'Password changed by user' } }
    );

    await AuditLog.log({
      action: 'PASSWORD_CHANGED',
      user: req.user,
      ipAddress: req.ip || '',
      userAgent: req.get('User-Agent') || '',
    });

    return res.status(200).json({
      success: true,
      message: 'Password successfully updated.',
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        status: user.status,
        mustChangePassword: user.mustChangePassword,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error('[ChangePassword Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to update password.',
    });
  }
};

module.exports = {
  login,
  adminLogin,
  traderLogin,
  getMe,
  logout,
  changePassword,
};
