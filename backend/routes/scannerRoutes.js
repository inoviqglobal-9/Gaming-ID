const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/scannerController');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { uploadScannerAsset } = require('../middleware/upload');

// Public or Authenticated (Client & Admin): Get currently active scanner
router.get('/active', requireAuth, getActiveScanner);

// Admin-Only Scanner Management
router.get('/admin', requireAuth, requireAdmin, getAllScannersAdmin);
router.post('/admin', requireAuth, requireAdmin, uploadScannerAsset.single('asset'), createScannerConfig);
router.get('/admin/:id', requireAuth, requireAdmin, getScannerByIdAdmin);
router.patch('/admin/:id', requireAuth, requireAdmin, uploadScannerAsset.single('asset'), updateScannerConfig);

// Lifecycle Actions
router.post('/admin/:id/publish', requireAuth, requireAdmin, publishScanner);
router.post('/admin/:id/unpublish', requireAuth, requireAdmin, unpublishScanner);
router.post('/admin/:id/activate', requireAuth, requireAdmin, activateScanner);
router.post('/admin/:id/deactivate', requireAuth, requireAdmin, deactivateScanner);

// Workflows A & B
router.post('/admin/:id/replace', requireAuth, requireAdmin, uploadScannerAsset.single('asset'), replaceScannerWorkflowA);
router.delete('/admin/:id', requireAuth, requireAdmin, deleteOrArchiveScanner);
router.post('/admin/:id/restore', requireAuth, requireAdmin, restoreScanner);

module.exports = router;
