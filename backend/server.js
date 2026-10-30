const http = require('http');
const app = require('./app');
const { connectDB, disconnectDB } = require('./config/db');
const { config, validateConfig } = require('./config/env');
const { initSocket } = require('./socket');

const startServer = async () => {
  const validation = validateConfig();
  if (!validation.valid) {
    console.warn('[Configuration Warning] Missing suggested variables:', validation.missing.join(', '));
  }

  try {
    // Connect to database
    await connectDB();

    // Ensure Initial Administrator exists in connected database
    const { ensureInitialAdmin } = require('./scripts/bootstrapAdmin');
    await ensureInitialAdmin();

    // Ensure Default Demo Scanner exists
    const { seedDemoScanner } = require('./scripts/seedDemoScanner');
    await seedDemoScanner();

    // Ensure Demo Trader exists for live testing
    const { seedDemoTrader } = require('./scripts/seedTrader');
    await seedDemoTrader();

    // Ensure Wallet Valuation Rate configuration exists without overwriting existing Admin configured rate
    const WalletRateConfig = require('./models/WalletRateConfig');
    const activeRate = await WalletRateConfig.getActiveRate();
    console.log(`[Rate Config] Active USDT Valuation Rate: ₹${activeRate.rateINRPerUSDT}/USDT (v${activeRate.version})`);

    // Ensure Crypto Commercial Settings configuration exists without overwriting existing Admin configured settings
    const CryptoCommercialSettings = require('./models/CryptoCommercialSettings');
    const activeCryptoSettings = await CryptoCommercialSettings.getSettings();
    console.log(`[Crypto Commercial] Active Crypto USDT Rate: ₹${activeCryptoSettings.usdtRateINR}/USDT, Deposit Bonus: +${activeCryptoSettings.depositBonusPercent}%, Withdrawal Bonus: +${activeCryptoSettings.withdrawalBonusPercent}% (v${activeCryptoSettings.version})`);

    const server = http.createServer(app);
    initSocket(server, config.clientOrigin);

    server.listen(config.port, () => {
      console.log('========================================================');
      console.log(`[Server] Secure Scanner & Trader Backend running on port ${config.port}`);
      console.log(`[Server] Environment: ${config.nodeEnv}`);
      console.log(`[Server] Client Origin: ${config.clientOrigin}`);
      console.log(`[Server] Healthcheck: http://localhost:${config.port}/api/health`);
      console.log('========================================================');
    });

    // Graceful shutdown
    const handleShutdown = async (signal) => {
      console.log(`\n[Server] Received ${signal}. Shutting down gracefully...`);
      server.close(async () => {
        await disconnectDB();
        console.log('[Server] Server closed. Process terminating.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('SIGINT', () => handleShutdown('SIGINT'));
  } catch (error) {
    console.error('[Server Fatal] Failed to start application:', error.message);
    process.exit(1);
  }
};

process.on('unhandledRejection', (reason) => {
  console.error('[Unhandled Rejection at Promise]:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]:', err.message);
  process.exit(1);
});

startServer();
