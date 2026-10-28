const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load .env from backend/config/.env, backend/.env, or root .env
const possibleEnvPaths = [
  path.resolve(__dirname, '../config/.env'),
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../.env'),
];

for (const envPath of possibleEnvPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}


const { connectDB, disconnectDB } = require('../config/db');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

const ensureInitialAdmin = async () => {
  const adminUsername = process.env.ADMIN_USERNAME?.trim();
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminUsername || !adminPassword) {
    console.warn('[Bootstrap Warning] ADMIN_USERNAME or ADMIN_PASSWORD not configured. Initial admin creation skipped.');
    return null;
  }

  const usernameRegex = /^[a-zA-Z0-9_.@-]{3,64}$/;
  if (!usernameRegex.test(adminUsername)) {
    console.warn('[Bootstrap Warning] ADMIN_USERNAME does not meet criteria (3-64 valid chars).');
    return null;
  }

  if (adminPassword.length < 8) {
    console.warn('[Bootstrap Warning] ADMIN_PASSWORD must be at least 8 characters long for security compliance.');
    return null;
  }

  const forbiddenPlaceholders = [
    'replace_with_a_strong_unique_password',
    'your_admin_password',
    'password',
    'admin123',
    '12345678',
  ];
  if (forbiddenPlaceholders.includes(adminPassword.toLowerCase())) {
    console.warn('[Bootstrap Warning] Insecure placeholder password detected in .env.');
    return null;
  }

  try {
    // Check if an ADMIN already exists
    const existingAdmin = await User.findOne({ role: 'ADMIN' });
    if (existingAdmin) {
      console.log(`[Bootstrap Info] An Administrator account already exists (ID: ${existingAdmin._id}).`);
      console.log('[Bootstrap Info] Existing Admin account was preserved. No credentials were overwritten.');
      return existingAdmin;
    }

    // Check if the requested username is taken by any account
    const usernameTaken = await User.findOne({ username: adminUsername.toLowerCase() });
    if (usernameTaken) {
      console.error(`[Error] A non-admin account with username '${adminUsername}' already exists. Please choose a different ADMIN_USERNAME.`);
      return null;
    }

    console.log(`[Bootstrap] Generating secure password hash for initial administrator...`);
    const passwordHash = await User.hashPassword(adminPassword);

    const newAdmin = new User({
      username: adminUsername.toLowerCase(),
      passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      mustChangePassword: false,
      notes: 'Initial Administrator created via secure bootstrap',
    });

    await newAdmin.save();

    // Log the event to AuditLog (without sensitive data!)
    await AuditLog.log({
      action: 'ADMIN_BOOTSTRAP',
      user: { _id: newAdmin._id, username: newAdmin.username, role: newAdmin.role },
      details: {
        method: 'SYSTEM_BOOTSTRAP',
        notes: 'Initial admin account created successfully',
      },
    });

    console.log('[Bootstrap Success] Initial Administrator created successfully!');
    console.log(`[Bootstrap Success] Username: ${newAdmin.username}`);
    console.log(`[Bootstrap Success] Role: ${newAdmin.role}`);
    console.log(`[Bootstrap Success] Status: ${newAdmin.status}`);
    console.log('[Bootstrap Success] Password stored as secure bcrypt hash. You may now log in via the web portal.');

    return newAdmin;
  } catch (err) {
    if (err.code === 11000) {
      console.log('[Bootstrap Info] Concurrent bootstrap prevented: Admin account already exists in database.');
      return await User.findOne({ role: 'ADMIN' });
    }
    console.error(`[Bootstrap Error] Failed to ensure initial admin: ${err.message}`);
    return null;
  }
};

const runAdminBootstrap = async () => {
  console.log('====================================================');
  console.log('[Bootstrap] Initializing Secure Admin Bootstrap System');
  console.log('====================================================');

  const adminUsername = process.env.ADMIN_USERNAME?.trim();
  const adminPassword = process.env.ADMIN_PASSWORD;
  const mongoUri = process.env.MONGODB_URI?.trim();

  // 1 & 2. Validate environment variables & reject weak credentials
  if (!mongoUri) {
    console.error('[Error] MONGODB_URI is not set in backend/.env. Bootstrap aborted.');
    process.exit(1);
  }

  if (!adminUsername || !adminPassword) {
    console.error('[Error] ADMIN_USERNAME and ADMIN_PASSWORD must be configured in backend/.env.');
    console.error('[Guidance] Copy .env.example to .env and configure your desired credentials.');
    process.exit(1);
  }

  const usernameRegex = /^[a-zA-Z0-9_.@-]{3,64}$/;
  if (!usernameRegex.test(adminUsername)) {
    console.error('[Error] ADMIN_USERNAME must be 3-64 characters and contain valid username/email characters.');
    process.exit(1);
  }

  if (adminPassword.length < 8) {
    console.error('[Error] ADMIN_PASSWORD must be at least 8 characters long for security compliance.');
    process.exit(1);
  }

  const forbiddenPlaceholders = [
    'replace_with_a_strong_unique_password',
    'your_admin_password',
    'password',
    'admin123',
    '12345678',
  ];
  if (forbiddenPlaceholders.includes(adminPassword.toLowerCase())) {
    console.error('[Error] Insecure placeholder password detected. Please set a unique, strong password in .env.');
    process.exit(1);
  }

  try {
    // 3 & 4. Connect to MongoDB
    console.log('[Bootstrap] Connecting to database securely...');
    await connectDB(mongoUri);

    const admin = await ensureInitialAdmin();
    console.log('====================================================');
    await disconnectDB();

    if (!admin) {
      process.exit(1);
    }
    process.exit(0);
  } catch (err) {
    if (err.code === 11000) {
      console.log('[Bootstrap Info] Concurrent bootstrap prevented: Admin account already exists in database.');
      await disconnectDB();
      process.exit(0);
    }
    console.error(`[Bootstrap Error] Process failed: ${err.message}`);
    await disconnectDB();
    process.exit(1);
  }
};

if (require.main === module) {
  runAdminBootstrap();
}

module.exports = {
  ensureInitialAdmin,
  runAdminBootstrap,
};
