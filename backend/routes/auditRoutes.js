const express = require('express');
const router = express.Router();
const { getAuditLogs } = require('../controllers/auditController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// Audit logs restricted strictly to Admin
router.get('/', requireAuth, requireAdmin, getAuditLogs);

module.exports = router;
