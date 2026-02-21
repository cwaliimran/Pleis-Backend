const {
  sendResponse,
  generateMeta,
  parsePaginationParams,
} = require("../helperUtils/responseUtil");
const moment = require("moment-timezone");
const { NotificationExp } = require("../models/Notifications");
const { getFullImageUrl } = require("@utils/imageHelper");
const Organizations = require("@OrganizationModel");
const { default: mongoose } = require("mongoose");
const { User } = require("@UserModel");
const { Events } = require("@EventsModel");
const { UserReservations } = require("@UserReservationsModel");

const getNotifications = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const keyword = req.query.keyword || null;
  const userId = req.user._id;
  const timezone = req.user.timezone || "UTC";

  try {
    const query = { receiverId: userId };
    if (keyword) query.type = { $regex: keyword, $options: "i" };

    /* ===============================
       FETCH NOTIFICATIONS
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
       COLLECT OBJECT IDS
    =============================== */
    const eventIds = [];
    const userReservationIds = [];
    const subjectIds = [];

    for (const n of notifications) {
      if (mongoose.Types.ObjectId.isValid(n.subjectId)) {
        subjectIds.push(new mongoose.Types.ObjectId(n.subjectId));
      }

      if (!mongoose.Types.ObjectId.isValid(n.objectId)) continue;

      if (n.objectType === "events") {
        eventIds.push(new mongoose.Types.ObjectId(n.objectId));
      }

      if (n.objectType === "userreservations") {
        userReservationIds.push(new mongoose.Types.ObjectId(n.objectId));
      }
    }

    /* ===============================
       FETCH EVENTS + USER RESERVATIONS
    =============================== */
    const [events, userReservations] = await Promise.all([
      eventIds.length
        ? Events.find({ _id: { $in: eventIds } })
            .select("basicInfo.organization")
            .lean()
        : [],

      userReservationIds.length
        ? UserReservations.find({ _id: { $in: userReservationIds } })
            .select("organizationId")
            .lean()
        : [],
    ]);

    /* ===============================
       BUILD OBJECT → ORG MAP
    =============================== */
    const objectOrgMap = new Map();

    events.forEach(e => {
      if (e.basicInfo?.organization) {
        objectOrgMap.set(
          e._id.toString(),
          e.basicInfo.organization.toString()
        );
      }
    });

    userReservations.forEach(r => {
      if (r.organizationId) {
        objectOrgMap.set(
          r._id.toString(),
          r.organizationId.toString()
        );
      }
    });

    /* ===============================
       FETCH ORGANIZATIONS
    =============================== */
    const organizationIds = [
      ...new Set([
        ...objectOrgMap.values(),
        ...subjectIds.map(id => id.toString())
      ])
    ]
      .filter(id => mongoose.Types.ObjectId.isValid(id))
      .map(id => new mongoose.Types.ObjectId(id));

    const organizations = organizationIds.length
      ? await Organizations.find({ _id: { $in: organizationIds } })
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
       FETCH USERS (SUBJECT FALLBACK)
    =============================== */
    const users = subjectIds.length
      ? await User.find({ _id: { $in: subjectIds } })
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
      const subjectId = String(n.subjectId);
      const objectId = String(n.objectId);

      const subjectOrg = orgMap.get(subjectId);
      const subjectUser = userMap.get(subjectId);

      const subject = subjectOrg ||
        subjectUser || { _id: null, title: "", image: "" };

      const orgId = objectOrgMap.get(objectId) || subjectId;
      const org = orgMap.get(orgId);

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

        organization: org
          ? {
              _id: org._id,
              title: org.title,
              image: getFullImageUrl(org.image),
            }
          : null,

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
