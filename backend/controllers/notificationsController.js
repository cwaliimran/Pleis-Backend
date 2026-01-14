const {
  sendResponse,
  generateMeta,
  parsePaginationParams,
} = require("../helperUtils/responseUtil");
const moment = require("moment-timezone");
const { NotificationExp } = require("../models/Notifications");
const { fetchEventDetails } = require("./notificationHelper/EventDetails");
const formatImage = require("./notificationHelper/formatImage");













const getNotifications = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const keyword= req.query.keyword || null;
  try {
    // Build the query to filter notifications
    const query = {
      receiverId: req.user._id,
    };

    if (keyword) {
      // Use a regex search to find the keyword in title, body, or type fields (case-insensitive)
      query.$or = [
        { type: { $regex: keyword, $options: "i" } },   // Search within type
      ];
    }

    const [notifications, totalNotifications] = await Promise.all([
      NotificationExp.find(query)
        .populate("subjectId", "_id firstName lastName username profileIcon")
        .populate("receiverId", "_id firstName lastName username profileIcon") // Populate full subjectId object
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      NotificationExp.countDocuments(query),
    ]);

    // Calculate pagination meta
    const meta = generateMeta(page, limit, totalNotifications);

    // Use Promise.all to wait for all async calls inside map
    const formattedNotifications = await Promise.all(
      notifications.map(async (notification) => {
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

        // If type is eventUpdate, fetch event details
        let eventDetails = null;
        if (type === "eventUpdate") {
          eventDetails = await fetchEventDetails(objectId); // Fetch event details
   
        }

        // Return the notification with event details
        return {
          _id,
          type,
          objectId,
          objectType,
          subject: subjectId,
          receiver: receiverId,
          title,
          body,
          data,
          isRead,
          timeSince,
          ...eventDetails,  // Add event details if available
        };
      })
    );

    const formattedNotificationsWithImages = formattedNotifications.map(notification =>
      formatImage(notification, req.user.timezone)
    );

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "notifications_fetched_success", // Use translation key
      data: formattedNotificationsWithImages,
      meta: meta,
    });
  } catch (error) {
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
