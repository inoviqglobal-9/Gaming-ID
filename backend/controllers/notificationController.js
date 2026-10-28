const Notification = require('../models/Notification');

// GET /api/notifications (Client or Admin: get notifications with unread count)
const getMyNotifications = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;

    const filter = { recipientUserId: req.user._id };
    const unreadCount = await Notification.countDocuments({
      recipientUserId: req.user._id,
      isRead: false,
    });

    const total = await Notification.countDocuments(filter);
    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return res.status(200).json({
      success: true,
      unreadCount,
      notifications,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    console.error('[Get Notifications Error]:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications.',
    });
  }
};

// PATCH /api/notifications/:id/read (Mark single as read)
const markNotificationRead = async (req, res) => {
  const { id } = req.params;
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: id, recipientUserId: req.user._id },
      { isRead: true, readAt: new Date() },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found.' });
    }

    const unreadCount = await Notification.countDocuments({
      recipientUserId: req.user._id,
      isRead: false,
    });

    return res.status(200).json({
      success: true,
      notification,
      unreadCount,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// PATCH /api/notifications/mark-all-read
const markAllNotificationsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { recipientUserId: req.user._id, isRead: false },
      { isRead: true, readAt: new Date() }
    );

    return res.status(200).json({
      success: true,
      message: 'All notifications marked as read.',
      unreadCount: 0,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
};
