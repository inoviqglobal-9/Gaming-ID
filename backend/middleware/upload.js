const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `scanner-${uuidv4()}${ext}`;
    cb(null, safeName);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
  const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];

  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedMimeTypes.includes(file.mimetype) && allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, and WEBP image files are allowed.'));
  }
};

const uploadScannerAsset = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB max
    files: 1,
  },
});

const depositStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `deposit-${uuidv4()}${ext}`;
    cb(null, safeName);
  },
});

const uploadDepositEvidence = multer({
  storage: depositStorage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
    files: 1,
  },
});

const uploadCryptoAdminQr = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, '../uploads')),
    filename: (req, file, cb) => cb(null, `crypto-admin-qr-${uuidv4()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

const uploadCryptoProof = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, '../uploads')),
    filename: (req, file, cb) => cb(null, `crypto-proof-${uuidv4()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

const uploadCryptoTraderQr = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, '../uploads')),
    filename: (req, file, cb) => cb(null, `crypto-trader-qr-${uuidv4()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

module.exports = {
  uploadScannerAsset,
  uploadDepositEvidence,
  uploadCryptoAdminQr,
  uploadCryptoProof,
  uploadCryptoTraderQr,
};

