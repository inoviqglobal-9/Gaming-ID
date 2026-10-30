const crypto = require('crypto');
const ScannerConfig = require('../models/ScannerConfig');
const PayInRequest = require('../models/PayInRequest');
const AuditLog = require('../models/AuditLog');
const CryptoPaymentQR = require('../models/CryptoPaymentQR');
const DepositConfig = require('../models/DepositConfig');
let cryptoController = null;
try {
  cryptoController = require('./cryptoController');
} catch (e) {
  // lazy or circular reference safe handling
}

// Generate unique scanner ID (e.g. QR-101, QR-102)
const generateScannerId = async () => {
  const count = await ScannerConfig.countDocuments();
  const randomSuffix = crypto.randomInt(100, 999);
  return `QR-${(count + 1).toString().padStart(3, '0')}-${randomSuffix}`;
};

// GET /api/scanner/active (Client & Public: returns the active, published scanner)
const getActiveScanner = async (req, res) => {
  try {
    const { network, currency } = req.query;
    const filter = {
      isActive: true,
      status: 'ACTIVE',
      isPublished: true,
    };

    if (network === 'TRC20' || currency === 'USDT') {
      filter.$or = [
        { paymentProvider: { $regex: /TRC20|USDT/i } },
        { scannerName: { $regex: /TRC20|USDT/i } },
        { supportedCurrencies: 'USDT' },
      ];
    }

    const scanner = await ScannerConfig.findOne(filter).sort({ updatedAt: -1 });

    if (!scanner) {
      return res.status(200).json({
        success: true,
        configured: false,
        isAvailable: false,
        message: 'Deposit payment destination is currently unavailable. Please contact administrator.',
        scanner: null,
      });
    }

    const walletAddress = (scanner.merchantIdentifier || scanner.walletAddress || '').trim();

    return res.status(200).json({
      success: true,
      configured: true,
      isAvailable: true,
      scanner: {
        id: scanner._id,
        scannerId: scanner.scannerId,
        scannerName: scanner.scannerName,
        merchantName: scanner.merchantName,
        merchantIdentifier: walletAddress,
        walletAddress,
        paymentProvider: scanner.paymentProvider,
        network: 'TRC20',
        currency: 'USDT',
        qrImageUrl: scanner.qrImageUrl || scanner.assetUrl,
        mode: scanner.mode,
        isDemo: scanner.mode === 'DEMO_ONLY',
        instructions: scanner.instructions,
        paymentPurpose: scanner.paymentPurpose,
        version: scanner.version,
        status: scanner.status,
        isActive: scanner.isActive,
        isPublished: scanner.isPublished,
        warningBanner:
          scanner.mode === 'DEMO_ONLY'
            ? 'DEMO ONLY — DO NOT PAY. This scanner is strictly for simulation and testing.'
            : null,
      },
    });
  } catch (error) {
    console.error('[Get Active Scanner Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve active scanner configuration.',
    });
  }
};

// GET /api/admin/scanner (Admin: list all scanners, with counts of pending payments)
const getAllScannersAdmin = async (req, res) => {
  try {
    const { status, mode, search } = req.query;
    const filter = {};

    if (status) {
      filter.status = status.toUpperCase();
    }
    if (mode) {
      filter.mode = mode.toUpperCase();
    }
    if (search) {
      filter.$or = [
        { scannerId: { $regex: search, $options: 'i' } },
        { scannerName: { $regex: search, $options: 'i' } },
        { merchantName: { $regex: search, $options: 'i' } },
      ];
    }

    const scanners = await ScannerConfig.find(filter)
      .sort({ isActive: -1, updatedAt: -1 })
      .populate('uploadedBy', 'username')
      .populate('archivedBy', 'username');

    // Attach pending and total payment counts for each scanner
    const scannersWithMetrics = await Promise.all(
      scanners.map(async (sc) => {
        const pendingCount = await PayInRequest.countDocuments({
          scannerConfigId: sc._id,
          status: { $in: ['PENDING', 'SUBMITTED', 'PENDING_VERIFICATION', 'UNDER_REVIEW'] },
        });
        const totalPaymentsCount = await PayInRequest.countDocuments({
          scannerConfigId: sc._id,
        });

        return {
          ...sc.toObject(),
          pendingPaymentsCount: pendingCount,
          totalPaymentsCount,
        };
      })
    );

    return res.status(200).json({
      success: true,
      scanners: scannersWithMetrics,
    });
  } catch (error) {
    console.error('[Get All Scanners Admin Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch scanner configurations.',
    });
  }
};

// GET /api/admin/scanner/:id (Admin: single scanner details with bound history)
const getScannerByIdAdmin = async (req, res) => {
  const { id } = req.params;
  try {
    const scanner = await ScannerConfig.findById(id)
      .populate('uploadedBy', 'username')
      .populate('archivedBy', 'username');

    if (!scanner) {
      return res.status(404).json({ success: false, message: 'Scanner configuration not found.' });
    }

    const pendingCount = await PayInRequest.countDocuments({
      scannerConfigId: scanner._id,
      status: { $in: ['PENDING', 'SUBMITTED', 'PENDING_VERIFICATION', 'UNDER_REVIEW'] },
    });
    const totalPaymentsCount = await PayInRequest.countDocuments({
      scannerConfigId: scanner._id,
    });

    return res.status(200).json({
      success: true,
      scanner: {
        ...scanner.toObject(),
        pendingPaymentsCount: pendingCount,
        totalPaymentsCount,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch scanner details.' });
  }
};

// POST /api/admin/scanner (Admin: Add New Scanner - Saved as DRAFT)
const createScannerConfig = async (req, res) => {
  const {
    scannerName,
    merchantName,
    merchantIdentifier = '',
    paymentProvider = 'USDT TRC20',
    mode = 'LIVE',
    paymentPurpose = 'Trader Crypto Deposit / PayIn',
    instructions,
    authorizationDetails = '',
    autoPublish = false,
  } = req.body;

  const walletAddress = (req.body.walletAddress || merchantIdentifier || '').trim();

  // Validate TRON address and reject PhonePe / UPI VPAs
  if (walletAddress && (walletAddress.includes('@') || walletAddress.toLowerCase().includes('phonepe') || walletAddress.toLowerCase().includes('upi'))) {
    return res.status(400).json({
      success: false,
      message: 'Invalid blockchain address: PhonePe/UPI VPAs are rejected. Please provide a valid TRON (TRC20) wallet address starting with "T".',
    });
  }

  const sName = (scannerName || (walletAddress ? `USDT TRC20 Scanner (${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)})` : '')).trim();
  const mName = (merchantName || 'RisePay USDT TRC20 Vault').trim();

  if (!sName || !mName) {
    return res.status(400).json({
      success: false,
      message: 'Wallet Address (TRC20) is required.',
    });
  }

  let qrImageUrl = '';
  if (req.file) {
    qrImageUrl = `/uploads/${req.file.filename}`;
  }

  try {
    const scannerId = await generateScannerId();
    const shouldPublish = String(autoPublish) === 'true';

    const newScanner = new ScannerConfig({
      scannerId,
      scannerName: sName,
      merchantName: mName,
      merchantIdentifier: walletAddress,
      paymentProvider: paymentProvider.trim(),
      qrImageUrl,
      assetUrl: qrImageUrl,
      paymentPurpose: paymentPurpose.trim(),
      instructions:
        instructions ||
        'Transfer exact USDT to this official TRON (TRC20) wallet address. Verify transaction hash (TXID) after sending.',
      mode: mode.toUpperCase() === 'DEMO_ONLY' ? 'DEMO_ONLY' : 'LIVE',
      status: shouldPublish ? 'PUBLISHED' : 'DRAFT',
      isPublished: shouldPublish,
      isActive: false, // Must remain Draft/Inactive until Admin explicitly activates
      authorizationStatus: mode.toUpperCase() === 'DEMO_ONLY' ? 'DEMO_EXEMPT' : 'AUTHORIZED',
      authorizationDetails: authorizationDetails.trim(),
      version: 1,
      uploadedBy: req.user._id,
    });

    await newScanner.save();

    await AuditLog.log({
      action: 'SCANNER_CREATED',
      user: req.user,
      ipAddress: req.ip || '',
      userAgent: req.get('User-Agent') || '',
      details: {
        scannerId: newScanner.scannerId,
        scannerName: newScanner.scannerName,
        merchantName: newScanner.merchantName,
        mode: newScanner.mode,
        status: newScanner.status,
      },
    });

    return res.status(201).json({
      success: true,
      message: `Scanner ${newScanner.scannerId} saved as ${newScanner.status}.`,
      scanner: newScanner,
    });
  } catch (error) {
    console.error('[Create Scanner Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: `Failed to create scanner: ${error.message}`,
    });
  }
};

// PATCH /api/admin/scanner/:id (Admin: Edit Scanner - Creates new version if merchant or QR changes)
const updateScannerConfig = async (req, res) => {
  const { id } = req.params;
  const {
    scannerName,
    merchantName,
    merchantIdentifier,
    paymentProvider,
    paymentPurpose,
    instructions,
    authorizationDetails,
    mode,
  } = req.body;

  try {
    const scanner = await ScannerConfig.findById(id);
    if (!scanner) {
      return res.status(404).json({ success: false, message: 'Scanner not found.' });
    }

    if (scanner.status === 'ARCHIVED') {
      return res.status(400).json({ success: false, message: 'Cannot edit an archived scanner. Restore it first.' });
    }

    let assetUpdated = false;
    let oldQr = scanner.qrImageUrl;
    if (req.file) {
      scanner.qrImageUrl = `/uploads/${req.file.filename}`;
      scanner.assetUrl = scanner.qrImageUrl;
      assetUpdated = true;
    }

    const merchantChanged = merchantName && merchantName.trim() !== scanner.merchantName;
    const qrChanged = assetUpdated;

    // If destination or merchant changed, archive current version in history
    if (merchantChanged || qrChanged) {
      scanner.versionHistory.push({
        version: scanner.version,
        scannerName: scanner.scannerName,
        merchantName: scanner.merchantName,
        merchantIdentifier: scanner.merchantIdentifier,
        qrImageUrl: oldQr,
        instructions: scanner.instructions,
        changedBy: req.user._id,
        changedAt: new Date(),
        reason: merchantChanged ? 'Merchant destination modified' : 'QR image replaced',
      });
      scanner.version += 1;
    }

    if (scannerName) scanner.scannerName = scannerName.trim();
    if (merchantName) scanner.merchantName = merchantName.trim();
    if (merchantIdentifier !== undefined) scanner.merchantIdentifier = merchantIdentifier.trim();
    if (paymentProvider) scanner.paymentProvider = paymentProvider.trim();
    if (paymentPurpose) scanner.paymentPurpose = paymentPurpose.trim();
    if (instructions) scanner.instructions = instructions.trim();
    if (authorizationDetails !== undefined) scanner.authorizationDetails = authorizationDetails.trim();
    if (mode) scanner.mode = mode.toUpperCase() === 'DEMO_ONLY' ? 'DEMO_ONLY' : 'LIVE';

    await scanner.save();

    await AuditLog.log({
      action: 'SCANNER_EDITED',
      user: req.user,
      ipAddress: req.ip || '',
      userAgent: req.get('User-Agent') || '',
      details: {
        scannerId: scanner.scannerId,
        version: scanner.version,
        merchantChanged,
        qrChanged,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Scanner details updated successfully.',
      scanner,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: `Update failed: ${error.message}` });
  }
};

// POST /api/admin/scanner/:id/publish
const publishScanner = async (req, res) => {
  const { id } = req.params;
  try {
    const scanner = await ScannerConfig.findById(id);
    if (!scanner) {
      return res.status(404).json({ success: false, message: 'Scanner not found.' });
    }

    if (scanner.status === 'ARCHIVED') {
      return res.status(400).json({ success: false, message: 'Archived scanners cannot be published directly.' });
    }

    scanner.status = 'PUBLISHED';
    scanner.isPublished = true;
    await scanner.save();

    await AuditLog.log({
      action: 'SCANNER_PUBLISHED',
      user: req.user,
      details: { scannerId: scanner.scannerId, name: scanner.scannerName },
    });

    return res.status(200).json({
      success: true,
      message: `Scanner ${scanner.scannerId} is now Published and eligible for activation.`,
      scanner,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/admin/scanner/:id/unpublish
const unpublishScanner = async (req, res) => {
  const { id } = req.params;
  try {
    const scanner = await ScannerConfig.findById(id);
    if (!scanner) {
      return res.status(404).json({ success: false, message: 'Scanner not found.' });
    }

    scanner.status = 'UNPUBLISHED';
    scanner.isPublished = false;
    scanner.isActive = false; // Cannot be active if unpublished
    await scanner.save();

    await AuditLog.log({
      action: 'SCANNER_UNPUBLISHED',
      user: req.user,
      details: { scannerId: scanner.scannerId },
    });

    return res.status(200).json({
      success: true,
      message: `Scanner ${scanner.scannerId} is now Unpublished.`,
      scanner,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/admin/scanner/:id/activate (Atomically activates this scanner & deactivates all others)
const activateScanner = async (req, res) => {
  const { id } = req.params;
  try {
    const scanner = await ScannerConfig.findById(id);
    if (!scanner) {
      return res.status(404).json({ success: false, message: 'Scanner not found.' });
    }

    if (scanner.status === 'ARCHIVED') {
      return res.status(400).json({ success: false, message: 'Archived scanners cannot be activated.' });
    }

    // 1. Verify that the scanner is published
    if (!scanner.isPublished && scanner.status !== 'PUBLISHED') {
      return res.status(400).json({
        success: false,
        message: 'Scanner must be published before activation.',
      });
    }

    // 2. Validate that the wallet address exists
    const walletAddr = (scanner.merchantIdentifier || scanner.walletAddress || '').trim();
    if (!walletAddr) {
      return res.status(400).json({
        success: false,
        message: 'Wallet address is required for scanner activation.',
      });
    }

    // 3. Validate that the QR image exists
    const qrImg = (scanner.qrImageUrl || scanner.assetUrl || '').trim();
    if (!qrImg) {
      return res.status(400).json({
        success: false,
        message: 'QR scanner image is required for scanner activation.',
      });
    }

    // 4. Validate that the scanner uses the configured USDT TRC20 network
    const isTrc20 =
      (scanner.paymentProvider && /TRC20|USDT/i.test(scanner.paymentProvider)) ||
      (scanner.scannerName && /TRC20|USDT/i.test(scanner.scannerName)) ||
      (Array.isArray(scanner.supportedCurrencies) && scanner.supportedCurrencies.includes('USDT'));
    if (!isTrc20) {
      return res.status(400).json({
        success: false,
        message: 'Scanner must be configured for the USDT TRC20 network.',
      });
    }

    // 5. Validate the TRON wallet address format (starts with 'T', 34 base58 characters)
    const tronRegex = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
    if (!tronRegex.test(walletAddr)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid TRON (TRC20) wallet address format. Address must start with "T" and contain exactly 34 Base58 characters.',
      });
    }

    // 7 & 8. Deactivate previous active scanner for the same payment module and network; prevent two simultaneously active
    await ScannerConfig.updateMany(
      { _id: { $ne: scanner._id }, isActive: true },
      {
        $set: {
          isActive: false,
          status: 'PUBLISHED',
          deactivatedAt: new Date(),
          deactivatedBy: req.user ? req.user._id : null,
        },
      }
    );

    // 6 & 9. Mark this scanner ACTIVE in MongoDB, save activation details and timestamp
    scanner.isActive = true;
    scanner.isPublished = true;
    scanner.status = 'ACTIVE';
    scanner.walletAddress = walletAddr;
    scanner.merchantIdentifier = walletAddr;
    scanner.qrImageUrl = qrImg;
    scanner.assetUrl = qrImg;
    scanner.activatedAt = new Date();
    scanner.activatedBy = req.user ? req.user._id : scanner.uploadedBy;
    await scanner.save();

    // 10. Synchronize with DepositConfig destinationWallets so backend deposit systems reflect newly active scanner
    try {
      const depConfig = await DepositConfig.getOrCreateDefault();
      const usdtIdx = (depConfig.destinationWallets || []).findIndex((w) => w.currency === 'USDT');
      if (usdtIdx !== -1) {
        depConfig.destinationWallets[usdtIdx].address = walletAddr;
        depConfig.destinationWallets[usdtIdx].network = 'TRC20';
        depConfig.destinationWallets[usdtIdx].label = scanner.scannerName || 'USDT TRC20 Vault';
        depConfig.destinationWallets[usdtIdx].isActive = true;
      } else {
        depConfig.destinationWallets.push({
          currency: 'USDT',
          network: 'TRC20',
          address: walletAddr,
          label: scanner.scannerName || 'USDT TRC20 Vault',
          isActive: true,
        });
      }
      await depConfig.save();
    } catch (depErr) {
      console.warn('[DepositConfig Sync Warning]:', depErr.message);
    }

    // Synchronize with CryptoPaymentQR if needed
    try {
      await CryptoPaymentQR.updateMany({}, { isActive: false });
      const existingQR = await CryptoPaymentQR.findOne({ walletAddress: walletAddr });
      let activeQRDoc;
      if (existingQR) {
        existingQR.isActive = true;
        existingQR.qrImageUrl = qrImg;
        existingQR.network = 'TRC20';
        await existingQR.save();
        activeQRDoc = existingQR;
      } else {
        activeQRDoc = await CryptoPaymentQR.create({
          qrId: scanner.scannerId,
          walletAddress: walletAddr,
          network: 'TRC20',
          qrImageUrl: qrImg,
          isActive: true,
          uploadedBy: req.user ? req.user._id : scanner.uploadedBy,
        });
      }
      if (cryptoController && cryptoController.broadcastActiveQR) {
        await cryptoController.broadcastActiveQR(activeQRDoc);
      }
    } catch (syncErr) {
      console.warn('[Scanner Activate Crypto Sync Error]:', syncErr.message);
    }

    // Real-time broadcast to connected Trader clients
    try {
      const io = req.app.get('io');
      if (io) {
        const payload = {
          scannerId: scanner.scannerId,
          scannerName: scanner.scannerName,
          walletAddress: walletAddr,
          qrImageUrl: qrImg,
          network: 'TRC20',
          currency: 'USDT',
          status: 'ACTIVE',
          isActive: true,
        };
        io.emit('scanner_config_updated', payload);
        io.emit('deposit_scanner_updated', payload);
      }
    } catch (socketErr) {
      console.warn('[Scanner Activate Socket Error]:', socketErr.message);
    }

    await AuditLog.log({
      action: 'SCANNER_ACTIVATED',
      user: req.user,
      ipAddress: req.ip || '',
      userAgent: req.get('User-Agent') || '',
      details: {
        scannerId: scanner.scannerId,
        scannerName: scanner.scannerName,
        walletAddress: walletAddr,
        mode: scanner.mode,
      },
    });

    return res.status(200).json({
      success: true,
      message: `Scanner ${scanner.scannerId} is now ACTIVE for all new deposit requests.`,
      scanner,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/admin/scanner/:id/deactivate
const deactivateScanner = async (req, res) => {
  const { id } = req.params;
  try {
    const scanner = await ScannerConfig.findById(id);
    if (!scanner) {
      return res.status(404).json({ success: false, message: 'Scanner not found.' });
    }

    scanner.isActive = false;
    scanner.status = 'INACTIVE';
    scanner.deactivatedAt = new Date();
    scanner.deactivatedBy = req.user ? req.user._id : null;
    await scanner.save();

    // Mark DepositConfig destination wallet inactive for USDT if no other active scanner
    try {
      const otherActive = await ScannerConfig.findOne({ _id: { $ne: scanner._id }, isActive: true });
      if (!otherActive) {
        const depConfig = await DepositConfig.getOrCreateDefault();
        const usdtIdx = (depConfig.destinationWallets || []).findIndex((w) => w.currency === 'USDT');
        if (usdtIdx !== -1) {
          depConfig.destinationWallets[usdtIdx].isActive = false;
          await depConfig.save();
        }
      }
    } catch (depErr) {
      console.warn('[DepositConfig Deactivate Warning]:', depErr.message);
    }

    const walletAddr = (scanner.merchantIdentifier || scanner.walletAddress || '').trim();
    if (walletAddr) {
      try {
        await CryptoPaymentQR.updateMany({ walletAddress: walletAddr }, { isActive: false });
        if (cryptoController && cryptoController.broadcastActiveQR) {
          const currentActive = await CryptoPaymentQR.getActiveQR();
          await cryptoController.broadcastActiveQR(currentActive || null);
        }
      } catch (syncErr) {
        console.warn('[Scanner Deactivate Crypto Sync Error]:', syncErr.message);
      }
    }

    // Real-time broadcast
    try {
      const io = req.app.get('io');
      if (io) {
        const payload = {
          scannerId: scanner.scannerId,
          status: 'INACTIVE',
          isActive: false,
          isAvailable: false,
        };
        io.emit('scanner_config_updated', payload);
        io.emit('deposit_scanner_updated', payload);
      }
    } catch (socketErr) {
      console.warn('[Scanner Deactivate Socket Error]:', socketErr.message);
    }

    await AuditLog.log({
      action: 'SCANNER_DEACTIVATED',
      user: req.user,
      details: { scannerId: scanner.scannerId },
    });

    return res.status(200).json({
      success: true,
      message: `Scanner ${scanner.scannerId} is now Deactivated.`,
      scanner,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/admin/scanner/:id/replace (Option A — Replace Now: uploads QR-2, saves, publishes, activates QR-2 & deactivates QR-1)
const replaceScannerWorkflowA = async (req, res) => {
  const { id: oldScannerId } = req.params;
  const {
    scannerName,
    merchantName,
    merchantIdentifier = '',
    paymentProvider = 'PhonePe Business',
    mode = 'LIVE',
    paymentPurpose = 'Trader Deposit / PayIn',
    instructions,
    authorizationDetails = '',
    archiveOld = false,
  } = req.body;

  if (!scannerName || !merchantName) {
    return res.status(400).json({
      success: false,
      message: 'Scanner Name and Merchant Name are required for replacing scanner.',
    });
  }

  let qrImageUrl = '';
  if (req.file) {
    qrImageUrl = `/uploads/${req.file.filename}`;
  }

  try {
    const oldScanner = await ScannerConfig.findById(oldScannerId);
    if (!oldScanner) {
      return res.status(404).json({ success: false, message: 'Existing scanner not found.' });
    }

    // 1. Deactivate old scanner (and optionally archive it)
    oldScanner.isActive = false;
    if (String(archiveOld) === 'true') {
      oldScanner.status = 'ARCHIVED';
      oldScanner.archivedAt = new Date();
      oldScanner.archivedBy = req.user._id;
    } else {
      oldScanner.status = 'INACTIVE';
    }
    await oldScanner.save();

    // 2. Also ensure no other scanner is active
    await ScannerConfig.updateMany(
      { _id: { $ne: oldScanner._id }, isActive: true },
      { $set: { isActive: false, status: 'INACTIVE' } }
    );

    // 3. Create and atomically activate new scanner (QR-2)
    const newScannerId = await generateScannerId();
    const newScanner = new ScannerConfig({
      scannerId: newScannerId,
      scannerName: scannerName.trim(),
      merchantName: merchantName.trim(),
      merchantIdentifier: merchantIdentifier ? merchantIdentifier.trim() : '',
      paymentProvider: paymentProvider.trim(),
      qrImageUrl,
      assetUrl: qrImageUrl,
      paymentPurpose: paymentPurpose.trim(),
      instructions:
        instructions ||
        'Scan this official PhonePe QR code. Verify the merchant name, pay the exact amount, and submit your 12-digit UTR/Reference ID.',
      mode: mode.toUpperCase() === 'DEMO_ONLY' ? 'DEMO_ONLY' : 'LIVE',
      status: 'ACTIVE',
      isPublished: true,
      isActive: true,
      authorizationStatus: mode.toUpperCase() === 'DEMO_ONLY' ? 'DEMO_EXEMPT' : 'AUTHORIZED',
      authorizationDetails: authorizationDetails.trim(),
      version: 1,
      uploadedBy: req.user._id,
    });

    await newScanner.save();

    await AuditLog.log({
      action: 'SCANNER_REPLACED',
      user: req.user,
      ipAddress: req.ip || '',
      userAgent: req.get('User-Agent') || '',
      details: {
        oldScannerId: oldScanner.scannerId,
        oldMerchant: oldScanner.merchantName,
        oldStatus: oldScanner.status,
        newScannerId: newScanner.scannerId,
        newMerchant: newScanner.merchantName,
      },
    });

    return res.status(201).json({
      success: true,
      message: `Successfully replaced ${oldScanner.scannerId} with ${newScanner.scannerId}. New scanner is ACTIVE!`,
      newScanner,
      oldScanner,
    });
  } catch (error) {
    console.error('[Replace Scanner Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: `Failed to replace scanner: ${error.message}`,
    });
  }
};

// DELETE /api/admin/scanner/:id (Option B — Delete First: checks pending payments & soft-archives)
const deleteOrArchiveScanner = async (req, res) => {
  const { id } = req.params;
  const { forceArchive = false } = req.body;

  try {
    const scanner = await ScannerConfig.findById(id);
    if (!scanner) {
      return res.status(404).json({ success: false, message: 'Scanner not found.' });
    }

    // Check pending requests tied to this scanner
    const pendingCount = await PayInRequest.countDocuments({
      scannerConfigId: scanner._id,
      status: { $in: ['PENDING', 'SUBMITTED', 'PENDING_VERIFICATION', 'UNDER_REVIEW'] },
    });

    const totalPaymentsCount = await PayInRequest.countDocuments({
      scannerConfigId: scanner._id,
    });

    // If scanner is active and admin hasn't confirmed force archive, warn
    if (scanner.isActive && !forceArchive) {
      return res.status(400).json({
        success: false,
        requiresConfirmation: true,
        isCurrentlyActive: true,
        pendingPaymentsCount: pendingCount,
        totalPaymentsCount,
        message: `Scanner ${scanner.scannerId} is currently ACTIVE. Clients will not be able to pay until another scanner is activated. Proceed with deactivation & archive?`,
      });
    }

    // If draft with 0 payments, safe to permanently delete from database
    if (totalPaymentsCount === 0 && scanner.status === 'DRAFT') {
      await ScannerConfig.findByIdAndDelete(id);

      await AuditLog.log({
        action: 'SCANNER_PERMANENTLY_DELETED',
        user: req.user,
        details: { scannerId: scanner.scannerId, reason: 'Unused draft deleted' },
      });

      return res.status(200).json({
        success: true,
        action: 'DELETED',
        message: `Draft scanner ${scanner.scannerId} permanently deleted.`,
      });
    }

    // Otherwise, perform Soft Archiving to preserve historical records and financial safety
    scanner.isActive = false;
    scanner.isPublished = false;
    scanner.status = 'ARCHIVED';
    scanner.archivedAt = new Date();
    scanner.archivedBy = req.user._id;
    await scanner.save();

    await AuditLog.log({
      action: 'SCANNER_ARCHIVED',
      user: req.user,
      details: {
        scannerId: scanner.scannerId,
        pendingPaymentsPreserved: pendingCount,
        totalPaymentsPreserved: totalPaymentsCount,
      },
    });

    return res.status(200).json({
      success: true,
      action: 'ARCHIVED',
      message: `Scanner ${scanner.scannerId} archived safely. Existing payment records preserved.`,
      pendingPaymentsCount: pendingCount,
      scanner,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: `Archiving failed: ${error.message}` });
  }
};

// POST /api/admin/scanner/:id/restore
const restoreScanner = async (req, res) => {
  const { id } = req.params;
  try {
    const scanner = await ScannerConfig.findById(id);
    if (!scanner) {
      return res.status(404).json({ success: false, message: 'Scanner not found.' });
    }

    scanner.status = 'INACTIVE';
    scanner.isPublished = false;
    scanner.isActive = false;
    scanner.archivedAt = null;
    scanner.archivedBy = null;
    await scanner.save();

    await AuditLog.log({
      action: 'SCANNER_RESTORED',
      user: req.user,
      details: { scannerId: scanner.scannerId },
    });

    return res.status(200).json({
      success: true,
      message: `Scanner ${scanner.scannerId} restored as Inactive. You can now edit, publish, or activate it.`,
      scanner,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getActiveScanner,
  getAllScannersAdmin,
  getScannerByIdAdmin,
  createScannerConfig,
  updateScannerConfig,
  publishScanner,
  unpublishScanner,
  activateScanner,
  deactivateScanner,
  replaceScannerWorkflowA,
  deleteOrArchiveScanner,
  restoreScanner,
};
