const {
  sendResponse,
  generateMeta,
  parsePaginationParams,
} = require("../helperUtils/responseUtil");
const moment = require("moment-timezone");
const { NotificationExp } = require("../models/Notifications");

// Get all notifications with pagination
const getNotifications = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);

  try {
    const [notifications, totalNotifications] = await Promise.all([
      NotificationExp.find({ receiverId: req.user._id })
        //  .populate('objectId') // Populate full subjectId object
        .populate("subjectId", "_id name profileIcon") // Populate full subjectId object
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      NotificationExp.countDocuments({ receiverId: req.user._id }),
    ]);

    // Calculate pagination meta
    const meta = generateMeta(page, limit, totalNotifications);

    const formattedNotifications = notifications.map((notification) => {
      const {
        _id,
        type,
        objectId,
        title,
        body,
        data,
        url,
        isRead,
        createdAt,
        objectType,
        subjectId,
        receiverId,
      } = notification;
      const userTimezone = req.user.timezone || "UTC";
      const timeSince = moment(createdAt).tz(userTimezone).fromNow();

      return {
        _id,
        type,
        objectId,
        objectType,
        subject: subjectId,
        title,
        body,
        data,
        isRead,
        timeSince,
      };
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "notifications_fetched_success", // Use translation key
      data: formattedNotifications,
      meta: meta,
    });
  } catch (error) {
    console.error(error);
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "notifications_fetch_error", // Use translation key for errors
      error,
    });
  }
};

// Mark a notification as read by ID
const readNotification = async (req, res) => {
  try {
    const notification = await NotificationExp.findByIdAndUpdate(
      req.params.id,
      { isRead: true },
      { new: true }
    );
    if (!notification) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "notification_not_found", // Use translation key
      });
    }
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "notification_marked_read_success", // Use translation key
      data: notification,
    });
  } catch (error) {
    console.error(error);
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "notification_mark_read_error", // Use translation key
      error,
    });
  }
};

module.exports = {
  getNotifications,
  readNotification,
};
