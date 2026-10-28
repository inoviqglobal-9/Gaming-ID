const AuditLog = require('../models/AuditLog');

// GET /api/admin/audit-logs
const getAuditLogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const action = req.query.action;
    const search = req.query.search;

    const filter = {};
    if (action) filter.action = action;
    if (search) {
      filter.$or = [
        { performedByUsername: { $regex: search, $options: 'i' } },
        { targetUsername: { $regex: search, $options: 'i' } },
        { action: { $regex: search, $options: 'i' } },
      ];
    }

    const total = await AuditLog.countDocuments(filter);
    const logs = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return res.status(200).json({
      success: true,
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    console.error('[Get Audit Logs Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch audit logs.',
    });
  }
};

module.exports = {
  getAuditLogs,
};
