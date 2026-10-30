const crypto = require('crypto');
const User = require('../models/User');
const Session = require('../models/Session');
const PayInRequest = require('../models/PayInRequest');
const PayoutRequest = require('../models/PayoutRequest');
const DepositRequest = require('../models/DepositRequest');
const CryptoRequest = require('../models/CryptoRequest');
const AuditLog = require('../models/AuditLog');
const BalanceLedger = require('../models/BalanceLedger');
const { config } = require('../config/env');

// Helper to generate secure random temporary password
const generateSecureTempPassword = (length = 10) => {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  let password = '';
  const randomBytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    password += charset[randomBytes[i] % charset.length];
  }
  return password;
};

// GET /api/admin/clients
const getClients = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const search = req.query.search ? req.query.search.trim().toLowerCase() : '';
    const status = req.query.status ? req.query.status.toUpperCase() : '';

    const filter = { role: { $in: ['CLIENT', 'TRADER'] } };

    if (search) {
      filter.username = { $regex: search, $options: 'i' };
    }

    if (status && ['ACTIVE', 'SUSPENDED', 'DEACTIVATED'].includes(status)) {
      filter.status = status;
    }

    const total = await User.countDocuments(filter);
    const clients = await User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-passwordHash');

    return res.status(200).json({
      success: true,
      data: clients,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    console.error('[Admin getClients Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch client list.',
    });
  }
};

// POST /api/admin/clients & /api/admin/traders
const createClient = async (req, res) => {
  const {
    fullName,
    username,
    traderId,
    password,
    confirmPassword,
    email,
    mobile,
    status = 'ACTIVE',
    notes,
  } = req.body;

  const targetUsername = (username || traderId || '').trim().toLowerCase();

  if (!targetUsername) {
    return res.status(400).json({
      success: false,
      message: 'Trader ID / Username is required.',
    });
  }

  const usernameRegex = /^[a-zA-Z0-9_.@-]{3,64}$/;
  if (!usernameRegex.test(targetUsername)) {
    return res.status(400).json({
      success: false,
      message: 'Username must be 3-64 characters (letters, numbers, hyphens, underscores, dots, @).',
    });
  }

  // Validate confirmPassword if provided
  if (confirmPassword && password && password !== confirmPassword) {
    return res.status(400).json({
      success: false,
      message: 'Password and Confirm Password do not match.',
    });
  }

  // Validate password length
  if (password && typeof password === 'string' && password.trim().length > 0 && password.trim().length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 6 characters long (or leave blank to auto-generate a permanent password).',
    });
  }

  try {
    const existing = await User.findOne({ username: targetUsername });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Trader ID '${targetUsername}' is already taken. Please choose another.`,
      });
    }

    const plainPassword =
      password && typeof password === 'string' && password.trim().length >= 6
        ? password.trim()
        : generateSecureTempPassword(10);

    const passwordHash = await User.hashPassword(plainPassword);

    const newClient = new User({
      fullName: fullName ? fullName.trim() : '',
      username: targetUsername,
      passwordHash,
      role: req.body.role
        ? req.body.role.toUpperCase()
        : (req.originalUrl && req.originalUrl.includes('trader'))
        ? 'TRADER'
        : 'CLIENT',
      status: status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE',
      email: email ? email.trim().toLowerCase() : '',
      mobile: mobile ? mobile.trim() : '',
      createdBy: req.user._id,
      sessionVersion: 1,
      mustChangePassword: false, // Direct login with permanent credentials
      notes: notes ? notes.trim() : '',
    });

    await newClient.save();

    await AuditLog.log({
      action: 'TRADER_CREATED',
      user: req.user,
      targetUser: newClient,
      ipAddress: req.ip || '',
      userAgent: req.get('User-Agent') || '',
      details: {
        traderId: newClient.username,
        fullName: newClient.fullName,
        credentialsType: 'PERMANENT',
      },
    });

    return res.status(201).json({
      success: true,
      message: `Trader '${newClient.username}' created successfully with permanent credentials.`,
      client: {
        id: newClient._id,
        fullName: newClient.fullName,
        username: newClient.username,
        role: newClient.role,
        status: newClient.status,
        email: newClient.email,
        mobile: newClient.mobile,
        mustChangePassword: false,
        createdAt: newClient.createdAt,
      },
      password: plainPassword,
      permanentPassword: plainPassword,
      temporaryPassword: plainPassword,
    });
  } catch (error) {
    console.error('[Admin createClient Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to create trader account.',
    });
  }
};

// POST /api/admin/generate-users (Bulk generate)
const bulkGenerateUsers = async (req, res) => {
  const { count, prefix = 'TRADER', notes = '' } = req.body;
  const numCount = parseInt(count, 10);

  if (!numCount || numCount < 1) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a valid number of users to generate.',
    });
  }

  if (numCount > config.maxBatchGenerateUsers) {
    return res.status(400).json({
      success: false,
      message: `Batch size cannot exceed configured maximum of ${config.maxBatchGenerateUsers} accounts.`,
    });
  }

  const cleanPrefix = (prefix || 'TRADER').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10);
  const generatedAccounts = [];
  const errors = [];

  try {
    for (let i = 0; i < numCount; i++) {
      // Collision resistant username generator
      const randomSuffix = crypto.randomInt(100000, 999999);
      const generatedUsername = `${cleanPrefix}_${randomSuffix}`.toLowerCase();

      // Check existence
      const exists = await User.findOne({ username: generatedUsername });
      if (exists) {
        // Try one alternative
        const altSuffix = crypto.randomInt(1000000, 9999999);
        const altUsername = `${cleanPrefix}_${altSuffix}`.toLowerCase();
        const altExists = await User.findOne({ username: altUsername });
        if (altExists) {
          errors.push(`Collision skipped for batch index ${i}`);
          continue;
        }
      }

      const tempPassword = generateSecureTempPassword(10);
      const passwordHash = await User.hashPassword(tempPassword);

      const userDoc = new User({
        username: generatedUsername,
        passwordHash,
        role: 'CLIENT',
        status: 'ACTIVE',
        mustChangePassword: false, // Direct login with permanent credentials
        notes: notes || 'Bulk generated account',
      });

      await userDoc.save();
      generatedAccounts.push({
        id: userDoc._id,
        username: userDoc.username,
        password: tempPassword,
        permanentPassword: tempPassword,
        temporaryPassword: tempPassword,
        createdAt: userDoc.createdAt,
      });
    }

    await AuditLog.log({
      action: 'BULK_USERS_GENERATED',
      user: req.user,
      ipAddress: req.ip || '',
      userAgent: req.get('User-Agent') || '',
      details: {
        requestedCount: numCount,
        successfullyCreated: generatedAccounts.length,
        prefix: cleanPrefix,
      },
    });

    return res.status(201).json({
      success: true,
      message: `Successfully generated ${generatedAccounts.length} client accounts.`,
      accounts: generatedAccounts, // Passwords shown ONLY once in this response
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('[Admin bulkGenerateUsers Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'An error occurred during bulk user generation.',
    });
  }
};

// GET /api/admin/clients/:id & /api/admin/traders/:id
const getClientById = async (req, res) => {
  const { id } = req.params;
  try {
    const client = await User.findById(id).select('-passwordHash');
    if (!client || (client.role !== 'CLIENT' && client.role !== 'TRADER')) {
      return res.status(404).json({
        success: false,
        message: 'Trader account not found.',
      });
    }

    return res.status(200).json({
      success: true,
      client,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch trader details.',
    });
  }
};

// PATCH /api/admin/clients/:id & /api/admin/traders/:id
const updateClient = async (req, res) => {
  const { id } = req.params;
  const { fullName, email, mobile, notes, status } = req.body;

  try {
    const client = await User.findById(id);
    if (!client || (client.role !== 'CLIENT' && client.role !== 'TRADER')) {
      return res.status(404).json({
        success: false,
        message: 'Trader account not found.',
      });
    }

    if (fullName !== undefined) client.fullName = fullName.trim();
    if (email !== undefined) client.email = email.trim().toLowerCase();
    if (mobile !== undefined) client.mobile = mobile.trim();
    if (notes !== undefined) client.notes = notes.trim();
    if (status !== undefined && ['ACTIVE', 'SUSPENDED', 'DEACTIVATED'].includes(status)) {
      client.status = status;
      if (status === 'SUSPENDED' || status === 'DEACTIVATED') {
        await Session.revokeAllUserSessions(client._id, `Account status changed to ${status}`);
      }
    }

    await client.save();

    await AuditLog.log({
      action: 'TRADER_UPDATED',
      user: req.user,
      targetUser: client,
      ipAddress: req.ip || '',
      userAgent: req.get('User-Agent') || '',
      details: { traderId: client.username },
    });

    return res.status(200).json({
      success: true,
      message: `Trader '${client.username}' updated successfully.`,
      client: {
        id: client._id,
        fullName: client.fullName,
        username: client.username,
        role: client.role,
        status: client.status,
        email: client.email,
        mobile: client.mobile,
        notes: client.notes,
        createdAt: client.createdAt,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to update trader account.',
    });
  }
};

// PATCH /api/admin/clients/:id/status & /api/admin/traders/:id/status
const updateClientStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['ACTIVE', 'SUSPENDED', 'DEACTIVATED'].includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Status must be either 'ACTIVE', 'SUSPENDED', or 'DEACTIVATED'.",
    });
  }

  try {
    const client = await User.findById(id);
    if (!client || (client.role !== 'CLIENT' && client.role !== 'TRADER')) {
      return res.status(404).json({
        success: false,
        message: 'Trader account not found.',
      });
    }

    const previousStatus = client.status;
    client.status = status;
    await client.save();

    // If suspended or deactivated, revoke all active sessions immediately!
    if (status === 'SUSPENDED' || status === 'DEACTIVATED') {
      await Session.revokeAllUserSessions(client._id, `Account status changed to ${status}`);
    }

    await AuditLog.log({
      action: `TRADER_STATUS_${status}`,
      user: req.user,
      targetUser: client,
      ipAddress: req.ip || '',
      userAgent: req.get('User-Agent') || '',
      details: { previousStatus, newStatus: status },
    });

    return res.status(200).json({
      success: true,
      message: `Trader '${client.username}' is now ${status}.`,
      client: {
        id: client._id,
        username: client.username,
        status: client.status,
      },
    });
  } catch (error) {
    console.error('[Admin updateClientStatus Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to update trader status.',
    });
  }
};

// POST /api/admin/clients/:id/reset-password & /api/admin/traders/:id/reset-password
const resetClientPassword = async (req, res) => {
  const { id } = req.params;
  const { password, newPassword } = req.body;

  try {
    const client = await User.findById(id);
    if (!client || (client.role !== 'CLIENT' && client.role !== 'TRADER')) {
      return res.status(404).json({
        success: false,
        message: 'Trader account not found.',
      });
    }

    let finalPassword = (newPassword || password || '').trim();
    if (!finalPassword) {
      finalPassword = generateSecureTempPassword(10);
    } else if (finalPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long.',
      });
    }

    client.passwordHash = await User.hashPassword(finalPassword);
    client.sessionVersion = (client.sessionVersion || 1) + 1;
    client.mustChangePassword = false; // Permanent password: direct login enabled
    await client.save();

    // Revoke all existing sessions immediately
    await Session.revokeAllUserSessions(client._id, 'Password reset by administrator');

    await AuditLog.log({
      action: 'ADMIN_RESET_TRADER_PASSWORD',
      user: req.user,
      targetUser: client,
      ipAddress: req.ip || '',
      userAgent: req.get('User-Agent') || '',
      details: { traderId: client.username },
    });

    return res.status(200).json({
      success: true,
      message: `Password reset successfully for '${client.username}'. Permanent credentials assigned.`,
      password: finalPassword,
      permanentPassword: finalPassword,
      temporaryPassword: finalPassword,
    });
  } catch (error) {
    console.error('[Admin resetClientPassword Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to reset trader password.',
    });
  }
};

// POST /api/admin/clients/:id/revoke-sessions & /api/admin/traders/:id/revoke-sessions
const revokeClientSessions = async (req, res) => {
  const { id } = req.params;

  try {
    const client = await User.findById(id);
    if (!client || (client.role !== 'CLIENT' && client.role !== 'TRADER')) {
      return res.status(404).json({
        success: false,
        message: 'Trader account not found.',
      });
    }

    client.sessionVersion = (client.sessionVersion || 1) + 1;
    await client.save();

    await Session.revokeAllUserSessions(client._id, 'Sessions revoked by administrator');

    await AuditLog.log({
      action: 'ADMIN_REVOKE_TRADER_SESSIONS',
      user: req.user,
      targetUser: client,
      ipAddress: req.ip || '',
      userAgent: req.get('User-Agent') || '',
      details: { traderId: client.username },
    });

    return res.status(200).json({
      success: true,
      message: `All active sessions revoked for '${client.username}'.`,
    });
  } catch (error) {
    console.error('[Admin revokeClientSessions Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to revoke trader sessions.',
    });
  }
};

// GET /api/admin/clients/export-csv
const exportClientsCsv = async (req, res) => {
  try {
    const clients = await User.find({ role: { $in: ['CLIENT', 'TRADER'] } }).sort({ createdAt: -1 });

    const headers = ['Client ID', 'Role', 'Status', 'Credentials', 'Last Login', 'Created At', 'Notes'];
    const rows = clients.map((c) => [
      `"${c.username}"`,
      `"${c.role}"`,
      `"${c.status}"`,
      `"Direct Access"`,
      `"${c.lastLoginAt ? new Date(c.lastLoginAt).toISOString() : 'Never'}"`,
      `"${c.createdAt ? new Date(c.createdAt).toISOString() : new Date().toISOString()}"`,
      `"${(c.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=fichaspot_clients_${Date.now()}.csv`);

    return res.status(200).send(csvContent);
  } catch (error) {
    console.error('[Admin exportClientsCsv Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to export clients CSV.',
    });
  }
};

// GET /api/admin/analytics
const getAdminAnalytics = async (req, res) => {
  try {
    const days = parseInt(req.query.days, 10) || 7;
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);

    // Client counts
    const totalClients = await User.countDocuments({ role: 'CLIENT' });
    const activeClients = await User.countDocuments({ role: 'CLIENT', status: 'ACTIVE' });
    const suspendedClients = await User.countDocuments({ role: 'CLIENT', status: 'SUSPENDED' });

    // PayIn stats by currency (INR and USDT kept strictly separate! Demo transactions excluded from revenue!)
    const payInInr = await PayInRequest.aggregate([
      { $match: { currency: 'INR', createdAt: { $gte: sinceDate }, isDemo: { $ne: true } } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
        },
      },
    ]);

    const payInUsdt = await PayInRequest.aggregate([
      { $match: { currency: 'USDT', createdAt: { $gte: sinceDate }, isDemo: { $ne: true } } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
        },
      },
    ]);

    const demoRequestsCount = await PayInRequest.countDocuments({ isDemo: true });

    // Payout stats by currency
    const payoutInr = await PayoutRequest.aggregate([
      { $match: { currency: 'INR', createdAt: { $gte: sinceDate } } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
        },
      },
    ]);

    const payoutUsdt = await PayoutRequest.aggregate([
      { $match: { currency: 'USDT', createdAt: { $gte: sinceDate } } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
        },
      },
    ]);

    // Pending counts across all request types (strictly Normal system)
    const pendingPayIns = await PayInRequest.countDocuments({ status: { $in: ['PENDING', 'SUBMITTED', 'UNDER_REVIEW'] } });
    const pendingPayouts = await PayoutRequest.countDocuments({ status: { $in: ['PENDING', 'UNDER_REVIEW', 'PROCESSING'] } });
    const pendingDeposits = await DepositRequest.countDocuments({
      status: { $in: ['PENDING', 'SUBMITTED', 'UNDER_REVIEW'] },
      systemType: { $ne: 'CRYPTO' },
    });

    // Recent requests
    const recentPayIns = await PayInRequest.find().sort({ createdAt: -1 }).limit(5);
    const recentPayouts = await PayoutRequest.find().sort({ createdAt: -1 }).limit(5);

    // Recent administrative actions
    const recentActivity = await AuditLog.find().sort({ createdAt: -1 }).limit(8);

    return res.status(200).json({
      success: true,
      analytics: {
        filterDays: days,
        clients: {
          total: totalClients,
          active: activeClients,
          suspended: suspendedClients,
        },
        pendingSummary: {
          payIns: pendingPayIns,
          payouts: pendingPayouts,
          deposits: pendingDeposits,
          demoRequests: demoRequestsCount,
          totalPending: pendingPayIns + pendingPayouts + pendingDeposits,
        },
        volume: {
          inr: {
            payIn: payInInr,
            payout: payoutInr,
          },
          usdt: {
            payIn: payInUsdt,
            payout: payoutUsdt,
          },
        },
        recentPayIns,
        recentPayouts,
        recentActivity,
      },
    });
  } catch (error) {
    console.error('[Admin getAdminAnalytics Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to aggregate dashboard analytics.',
    });
  }
};

// DELETE /api/admin/clients/:id
const deleteClient = async (req, res) => {
  const { id } = req.params;

  try {
    const client = await User.findById(id);
    if (!client || (client.role !== 'CLIENT' && client.role !== 'TRADER')) {
      return res.status(404).json({
        success: false,
        message: 'Client account not found.',
      });
    }

    // Check if the client has any associated financial transactions or ledger entries
    const [hasLedger, hasPayIn, hasPayout, hasDeposit, hasCrypto] = await Promise.all([
      BalanceLedger.findOne({ userId: client._id }),
      PayInRequest.findOne({ userId: client._id }),
      PayoutRequest.findOne({ userId: client._id }),
      DepositRequest.findOne({ userId: client._id }),
      CryptoRequest.findOne({ userId: client._id }),
    ]);

    if (hasLedger || hasPayIn || hasPayout || hasDeposit || hasCrypto) {
      return res.status(400).json({
        success: false,
        message: 'Cannot permanently delete this client because financial transaction history exists. Deactivate the account instead to maintain financial integrity and audit records.',
      });
    }

    // Safe to delete client account and related sessions
    await Session.deleteMany({ userId: client._id });
    await User.findByIdAndDelete(client._id);

    await AuditLog.log({
      action: 'CLIENT_DELETED',
      user: req.user,
      targetUsername: client.username,
      ipAddress: req.ip || '',
      userAgent: req.get('User-Agent') || '',
      details: {
        deletedClientId: client.username,
        reason: 'Administrator permanently removed client with zero financial history',
      },
    });

    return res.status(200).json({
      success: true,
      message: `Client '${client.username}' has been permanently deleted.`,
    });
  } catch (error) {
    console.error('[Admin deleteClient Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete client account.',
    });
  }
};

module.exports = {
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
};
