const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');
const { config } = require('./config/env');
const { apiLimiter } = require('./middleware/rateLimiter');

// Import routes
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const payinRoutes = require('./routes/payinRoutes');
const payoutRoutes = require('./routes/payoutRoutes');
const depositRoutes = require('./routes/depositRoutes');
const cryptoRoutes = require('./routes/cryptoRoutes');
const scannerRoutes = require('./routes/scannerRoutes');
const auditRoutes = require('./routes/auditRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const traderRoutes = require('./routes/traderRoutes');

const app = express();

// Security Headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// CORS allowlist configuration
app.use(
  cors({
    origin: config.clientOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);

// Body parsing with limits
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// Static file serving for uploaded scanner QR assets
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check endpoint (exempt from rate limits)
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    environment: config.nodeEnv,
    timestamp: new Date().toISOString(),
  });
});

// General API rate limiter for all /api endpoints
app.use('/api', apiLimiter);

// Mount modular API routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payin', payinRoutes);
app.use('/api/payout', payoutRoutes);
app.use('/api/deposit', depositRoutes);
app.use('/api/crypto', cryptoRoutes);
app.use('/api/scanner', scannerRoutes);
app.use('/api/admin/audit-logs', auditRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/trader', traderRoutes);

// 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'API route not found.',
  });
});

// Centralized error handler
app.use((err, req, res, next) => {
  console.error('[Global Error]:', err.message);

  // Handle Multer upload errors
  if (err.name === 'MulterError') {
    return res.status(400).json({
      success: false,
      message: `File upload error: ${err.message}`,
    });
  }

  return res.status(err.status || 500).json({
    success: false,
    message: config.isProduction ? 'An unexpected server error occurred.' : err.message,
  });
});

module.exports = app;
