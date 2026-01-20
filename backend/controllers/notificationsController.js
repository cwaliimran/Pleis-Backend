const {
  sendResponse,
  generateMeta,
  parsePaginationParams,
} = require("../helperUtils/responseUtil");
const moment = require("moment-timezone");
const { NotificationExp } = require("../models/Notifications");
const { fetchEventDetails } = require("./notificationHelper/EventDetails");
const formatImage = require("./notificationHelper/formatImage");
const { getFullImageUrl } = require("@utils/imageHelper");
const Organizations = require("@OrganizationModel");
const { default: mongoose } = require("mongoose");
const { User } = require("@UserModel");

const getNotifications = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const keyword = req.query.keyword || null;
  const userId = req.user._id;
  const timezone = req.user.timezone || "UTC";

  try {
    const query = { receiverId: userId };
    if (keyword) query.type = { $regex: keyword, $options: "i" };

    /* ===============================
       FETCH NOTIFICATIONS (NO POPULATE)
    =============================== */
    const [notifications, total] = await Promise.all([
      NotificationExp.find(query)
        .select(
          "_id type objectId objectType title body isRead subjectId image createdAt"
        )
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      NotificationExp.countDocuments(query),
    ]);

    if (!notifications.length) {
      return sendResponse({
        res,
        statusCode: 200,
        translationKey: "notifications_fetched_success",
        data: [],
        meta: generateMeta(page, limit, total),
      });
    }
 
    /* ===============================
       COLLECT IDS BY TYPE
    =============================== */
    const userIds = [];
    const orgIds = [];

    for (const n of notifications) {
      if (!mongoose.Types.ObjectId.isValid(n.subjectId)) continue;

      if (n.objectType === "menuorders") {
        orgIds.push(new mongoose.Types.ObjectId(n.subjectId));
      } else {
        userIds.push(new mongoose.Types.ObjectId(n.subjectId));
      }
    }

    /* ===============================
       FETCH ORGANIZATIONS
    =============================== */
    const organizations = orgIds.length
      ? await Organizations.find({ _id: { $in: orgIds } })
        .select("basicInfo.name basicInfo.media.logo")
        .lean()
      : [];

    const orgMap = new Map(
      organizations.map(o => [
        o._id.toString(),
        {
          _id: o._id,
          title: o.basicInfo?.name || "",
          image: o.basicInfo?.media?.logo || "",
        },
      ])
    );

    /* ===============================
       FETCH USERS
    =============================== */
    const users = userIds.length
      ? await User.find({ _id: { $in: userIds } })
        .select("companyDetails.loyaltySettings.title companyDetails.logo")
        .lean()
      : [];

    const userMap = new Map(
      users.map(u => [
        u._id.toString(),
        {
          _id: u._id,
          title: u.companyDetails?.loyaltySettings?.title || "",
          image: u.companyDetails?.logo || "",
        },
      ])
    );

    /* ===============================
       FORMAT RESPONSE
    =============================== */
    const formatted = notifications.map(n => {
      let subject = { _id: null, title: "", image: "" };

      if (n.objectType === "menuorders") {
        subject = orgMap.get(String(n.subjectId)) || subject;
      } else {
        subject = userMap.get(String(n.subjectId)) || subject;
      }

      return {
        _id: n._id,
        type: n.type,
        objectId: n.objectId,
        objectType: n.objectType,
        title: n.title,
        body: n.body,
        isRead: n.isRead,
        subject: {
          _id: subject._id,
          title: subject.title,
          image: getFullImageUrl(subject.image),
        },
        image: getFullImageUrl(n.image),
        timeSince: moment(n.createdAt).tz(timezone).fromNow(),
        createdAt: n.createdAt,
      };
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "notifications_fetched_success",
      data: formatted,
      meta: generateMeta(page, limit, total),
    });

  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "notifications_fetch_error",
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
