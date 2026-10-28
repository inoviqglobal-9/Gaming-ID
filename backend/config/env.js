const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Support multiple locations: backend/config/.env, backend/.env, or root .env
const possibleEnvPaths = [
  path.resolve(__dirname, '.env'),        // backend/config/.env
  path.resolve(__dirname, '../.env'),     // backend/.env
  path.resolve(__dirname, '../../.env'),  // root .env
];

let loadedEnvPath = null;
for (const envPath of possibleEnvPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    loadedEnvPath = envPath;
    break;
  }
}


const config = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/secure_scanner_trader',
  sessionSecret: process.env.SESSION_SECRET || 'dev_session_secret_change_in_production_min_32_chars',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  adminUsername: process.env.ADMIN_USERNAME,
  adminPassword: process.env.ADMIN_PASSWORD,
  maxBatchGenerateUsers: parseInt(process.env.MAX_BATCH_GENERATE_USERS, 10) || 50,
  payinExpiryMinutes: parseInt(process.env.PAYIN_EXPIRY_MINUTES, 10) || 60,
  cookieName: 'scanner_trader_session',
  isProduction: process.env.NODE_ENV === 'production',
  dnsServers: process.env.DNS_SERVERS
    ? process.env.DNS_SERVERS.split(',').map((s) => s.trim()).filter(Boolean)
    : ['8.8.8.8', '1.1.1.1'],
  mongodbTimeoutMs: parseInt(process.env.MONGODB_TIMEOUT_MS, 10) || 10000,
  mongodbMaxRetries: parseInt(process.env.MONGODB_MAX_RETRIES, 10) || 3,
  mongodbRetryDelayMs: parseInt(process.env.MONGODB_RETRY_DELAY_MS, 10) || 2000,
  usdtInrRate: parseFloat(process.env.USDT_INR_RATE) || 105.00,
  cryptoDepositBonusPercent: parseFloat(process.env.CRYPTO_DEPOSIT_BONUS_PERCENT) || 3.0,
  cryptoDepositFeePercent: 0.0,
  cryptoWithdrawalFeePercent: parseFloat(process.env.CRYPTO_WITHDRAWAL_FEE_PERCENT) || 0.0,
  cryptoWithdrawalBonusPercent: parseFloat(process.env.CRYPTO_WITHDRAWAL_BONUS_PERCENT) || 1.0,
};

// Validate environment without leaking sensitive contents
const validateConfig = () => {
  const missing = [];
  const warnings = [];

  if (!process.env.MONGODB_URI && !config.mongodbUri) {
    missing.push('MONGODB_URI (Database connection URI is required)');
  }

  if (isNaN(config.usdtInrRate) || config.usdtInrRate <= 0) {
    missing.push('USDT_INR_RATE must be a valid positive number');
  }

  if (!config.sessionSecret || config.sessionSecret.length < 16) {
    if (config.isProduction) {
      missing.push('SESSION_SECRET (must be >= 16 characters)');
    } else {
      warnings.push('SESSION_SECRET is using development default');
    }
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings,
  };
};

module.exports = {
  config,
  validateConfig,
};
