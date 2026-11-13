import Notification from "../models/Notification.js";

/**
 * Fetch recent notifications and unread count for the authenticated user.
 */
export const getMyNotifications = async (req, res) => {
  try {
    const userId = req.user.userId;

    const [notifications, unreadCount] = await Promise.all([
      Notification.find({ recipient: userId })
        .sort({ createdAt: -1 })
        .limit(30)
        .lean(),
      Notification.countDocuments({ recipient: userId, isRead: false }),
    ]);

    res.json({
      notifications,
      unreadCount,
    });
  } catch (error) {
    console.error("GET NOTIFICATIONS ERROR:", error);
    res.status(500).json({
      message: error.message || "Failed to fetch notifications",
    });
  }
};

/**
 * Mark a single notification belonging to the authenticated user as read.
 */
export const markNotificationAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user.userId },
      { $set: { isRead: true } },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        message: "Notification not found",
      });
    }

    res.json({ notification });
  } catch (error) {
    console.error("MARK NOTIFICATION READ ERROR:", error);
    res.status(500).json({
      message: error.message || "Failed to update notification",
    });
  }
};

/**
 * Mark all unread notifications for the authenticated user as read.
 */
export const markAllNotificationsAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user.userId, isRead: false },
      { $set: { isRead: true } }
    );

    res.json({ message: "All notifications marked as read" });
  } catch (error) {
    console.error("MARK ALL NOTIFICATIONS READ ERROR:", error);
    res.status(500).json({
      message: error.message || "Failed to mark all notifications as read",
    });
  }
};
