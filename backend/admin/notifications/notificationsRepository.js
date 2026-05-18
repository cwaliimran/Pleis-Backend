const { buildKeywordQueryFromModels } = require("@utils/dbUtils/queryUtil");
const { generateMeta } = require("@utils/responseUtil");
const mongoose = require("mongoose");
const {
  GlobalNotification,
  GlobalNotificationEvent,
  GlobalNotificationOrganization,
  GlobalNotificationhome
} = require("../../commonModules/notifications");
const Tags = require("@TagsModel");
const { NotificationExp } = require("@NotificationsModel");
const Organizations = require("@OrganizationModel");
const { Events } = require("@EventsModel");
const { User } = require("@UserModel");
const { sendUserNotifications } = require("../../controllers/communicationController");
const { NotificationTypes } = require("@NotificationsModel");
const { notificationFormatter } = require("./helper/notificationFormatter");
const { cache, invalidate } = require("@redisCache");
const ACTIVE_GLOBAL_NOTIFICATIONS_CACHE_KEY = "GlobalNotifications:active";
const buildGlobalNotificationsCacheKey = ({
  scope = "admin", // public | admin
  skip = 0,
  limit = 10
}) => {
  return `${ACTIVE_GLOBAL_NOTIFICATIONS_CACHE_KEY}:${scope}:skip=${skip}:limit=${limit}`;
};


// Decide which discriminator model to use
const getModelByTaskType = (taskType) => {
  switch (taskType) {
    case "organization":
      return GlobalNotificationOrganization;
    case "event":
      return GlobalNotificationEvent;
    case "home":
      return GlobalNotificationhome;
    default:
      return GlobalNotification; // fallback
  }
};

const getFilteredUserIdsCombined = async ({
  ageRange,
  gender,
  interests,
  center,
  radius,
  limit = 500
}) => {
  const pipeline = [
    {
      $match: {
        "accountState.status": "active",
        $or: [
          { "verificationStatus.email": "verified" },
          { "verificationStatus.phoneNumber": "verified" }
        ]
      }
    }
  ];

  /* ===================== AGE FILTER ===================== */
  if (Array.isArray(ageRange) && ageRange.length === 2) {
    pipeline.push(
      {
        $match: {
          dob: { $exists: true, $ne: "" }
        }
      },
      {
        $addFields: {
          age: {
            $floor: {
              $divide: [
                { $subtract: [new Date(), { $toDate: "$dob" }] },
                31557600000
              ]
            }
          }
        }
      },
      {
        $match: {
          age: {
            $gte: ageRange[0],
            $lte: ageRange[1]
          }
        }
      }
    );
  }

  /* ===================== GENDER FILTER ===================== */
  if (gender && gender.toLowerCase() !== "all") {
    pipeline.push({
      $match: {
        gender: { $regex: `^${gender}$`, $options: "i" }
      }
    });
  }

  /* ===================== LOCATION FILTER ===================== */
  if (center && radius) {
    pipeline.push({
      $match: {
        "location.coordinates": {
          $geoWithin: {
            $centerSphere: [
              center.coordinates,
              radius / 6378.1
            ]
          }
        }
      }
    });
  }

  /* ===================== INTEREST FILTER ===================== */
  if (Array.isArray(interests) && interests.length > 0) {
    const interestObjectIds = interests.map(
      id => new mongoose.Types.ObjectId(id)
    );

    pipeline.push(
      {
        $lookup: {
          from: "userinterests",
          localField: "_id",
          foreignField: "user",
          as: "userInterests"
        }
      },
      { $unwind: "$userInterests" },
      {
        $match: {
          "userInterests.tags": { $in: interestObjectIds }
        }
      }
    );
  }

  /* ===================== FINAL ===================== */
  pipeline.push(
    { $limit: limit },
    {
      $project: {
        _id: 1
      }
    }
  );

  const users = await User.aggregate(pipeline);

  // ✅ unique string IDs
  return {
    userIds: [...new Set(users.map(u => u._id.toString()))],
    meta: { totalFiltered: users.length }
  };
};

const getAllUserIds = async () => {
  try {
    const users = await User.find(
      {
        "accountState.status": "active",
        
        $or: [
          { "verificationStatus.email": "verified" },
          { "verificationStatus.phoneNumber": "verified" }
        ]
      },
      { _id: 1 }
    ).lean();

    return users.map(user => user._id.toString());
  } catch (err) {
    throw err;
  }
};

const createNotifications = async (data) => {
  try {
    await invalidate(ACTIVE_GLOBAL_NOTIFICATIONS_CACHE_KEY);

    let usersResult = await getFilteredUserIdsCombined({
      ageRange: data.ageRange || null,
      gender: data.gender || null,
      interests: data.interests || [],
      center: data.center || null,
      radius: data.radius ?? 0,
    });

    // 🔥 fallback (no filters)
    if (!data.ageRange && !data.gender && !data.interests && !data.center && !data.radius) {
      const allUserIds = await getAllUserIds();
      usersResult.userIds = allUserIds;
    }

    const userIds = usersResult.userIds || [];
    console.log("userIds", userIds.length);
    return

    const notificationSystemType =
      data.organizationId
        ? NotificationTypes.ORGANIZATION_DETAILS
        : data.eventId
          ? NotificationTypes.EVENT_DETAILS
          : NotificationTypes.HOME;

    const Model = getModelByTaskType(data.destinationType);

    let globalNotification = null;

    // ===============================
    // COMMON LOGIC
    // ===============================

    data.estimated = userIds.length;

    if (data.sendTiming === "immediately") {
      data.isDelivered = true;
      data.delivered = userIds.length;
    }

    globalNotification = new Model(data);
    const savedNotification = await globalNotification.save();

    // ===============================
    // SEND NOTIFICATION (ONLY IF IMMEDIATE)
    // ===============================
    if (data.sendTiming === "immediately") {
      await sendUserNotifications({
        recipientIds: userIds,
        title: data.title,
        body: `You received a new message: ${data.description}`,
        data: {
          type: notificationSystemType,
          objectType: "GlobalNotification",
        },
        sender: data.creator,
        objectId: savedNotification._id,
        image: data.image || "",
      });
    }

    return savedNotification;

  } catch (err) {
    throw err;
  }
};


const getNotificationss = async ({
  isDelivered,
  sendTiming,
  timezone,
  page,
  limit,
  keyword,
  status,
  date,
  range,
  today,
  skip,
  userId,
}) => {

  const pipeline = [
    {
      $match: {},
    },
  ];

  // ----- Range filters -----
  if (range === "monthly") {
    const { start, end } = getStartAndEndOfMonth(today, timezone);
    pipeline.push({
      $match: { createdAt: { $gte: start, $lt: end } },
    });
  }

  if (range === "weekly") {
    const { start, end } = getStartAndEndOfWeek(today, timezone);
    pipeline.push({
      $match: { createdAt: { $gte: start, $lt: end } },
    });
  }

  if (range === "today") {
    const start = new Date(today);
    const end = new Date(new Date(today).setDate(start.getDate() + 1));
    pipeline.push({
      $match: { createdAt: { $gte: start, $lt: end } },
    });
  }

  // ----- Status -----
  if (status) {
    pipeline.push({ $match: { status } });
  } else {
    pipeline.push({ $match: { status: { $ne: "deleted" } } });
  }

  // ----- Timing -----
  if (sendTiming) {
    pipeline.push({ $match: { sendTiming } });
  }

  // ----- Delivery filter -----
  if (isDelivered !== undefined) {
    if (isDelivered === "true") isDelivered = true;
    if (isDelivered === "false") isDelivered = false;

    if (typeof isDelivered === "boolean") {
      pipeline.push({ $match: { isDelivered } });
    }
  }

  // ----- Date filter -----
  if (date) {
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    pipeline.push({
      $match: { createdAt: { $gte: start, $lt: end } },
    });
  }

  // ----- Keyword search -----
  if (keyword) {
    const keywordMatch = buildKeywordQueryFromModels(
      [{ schema: GlobalNotification.schema }],
      keyword
    );

    if (Object.keys(keywordMatch).length) {
      pipeline.push({ $match: keywordMatch });
    }
  }

  // ----- Lookups -----
  pipeline.push(
    {
      $lookup: {
        from: "organizations",
        localField: "organizationId",
        foreignField: "_id",
        as: "organization",
        pipeline: [
          {
            $project: {
              _id: 1,
              "basicInfo.name": 1,
            },
          },
        ],
      },
    },
    {
      $lookup: {
        from: "events",
        localField: "eventId",
        foreignField: "_id",
        as: "event",
        pipeline: [
          {
            $project: {
              _id: 1,
              "basicInfo.title": 1,
            },
          },
        ],
      },
    },
    {
      $addFields: {
        organization: { $arrayElemAt: ["$organization", 0] },
        event: { $arrayElemAt: ["$event", 0] },
      },
    },
    {
      $project: {
        _id: 1,
        destinationType: 1,
        creator: 1,
        title: 1,
        estimated: 1,
        delivered: 1,
        message: 1,
        image: 1,
        status: 1,
        location: 1,
        ageRange: 1,
        gender: 1,
        interests: 1,
        sendTiming: 1,
        scheduledDateTime: 1,
        isDelivered: 1,
        organization: 1,
        event: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    }
  );

  pipeline.push({ $sort: { createdAt: -1 } });

  // ----- Facet -----
  pipeline.push({
    $facet: {
      data: [
        { $skip: skip },
        ...(limit === 0 ? [] : [{ $limit: limit }]),
      ],
      totalReached: [
        {
          $group: {
            _id: null,
            count: { $sum: { $ifNull: ["$estimated", 0] } },
          },
        },
      ],
      totalFiltered: [{ $count: "count" }],
      totalScheduled: [
        { $match: { sendTiming: "schedule" } },
        { $count: "count" },
      ],
      totalDelivered: [
        { $match: { isDelivered: true } },
        { $count: "count" },
      ],
      totalLocationFiltered: [
        { $match: { "location.city": { $exists: true, $ne: null } } },
        { $count: "count" },
      ],
      totalAgeFiltered: [
        { $match: { ageRange: { $exists: true, $ne: [] } } },
        { $count: "count" },
      ],
      totalInterestsFiltered: [
        { $match: { interests: { $exists: true, $ne: [] } } },
        { $count: "count" },
      ],
      totalGenderFiltered: [
        { $match: { gender: { $nin: [null, []] } } },
        { $count: "count" },
      ],
    },
  });

  // ----- Run aggregation -----
  const result = await GlobalNotification.aggregate(pipeline);

  let Notificationss = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;
  const totalScheduled = result[0]?.totalScheduled[0]?.count || 0;
  const totalDelivered = result[0]?.totalDelivered[0]?.count || 0;
  const totalLocationFiltered =
    result[0]?.totalLocationFiltered[0]?.count || 0;
  const totalAgeFiltered =
    result[0]?.totalAgeFiltered[0]?.count || 0;
  const totalInterestsFiltered =
    result[0]?.totalInterestsFiltered[0]?.count || 0;
  const totalGenderFiltered =
    result[0]?.totalGenderFiltered[0]?.count || 0;
  const totalReached = result[0]?.totalReached[0]?.count || 0;

  const grandTotalFiltered =
    totalInterestsFiltered +
    totalLocationFiltered +
    totalAgeFiltered +
    totalGenderFiltered;

  // ----- Meta counts -----
  const [total, active, inactive] = await Promise.all([
    GlobalNotification.countDocuments({
      ...(userId && { userId }),
      status: { $ne: "deleted" },
    }),
    GlobalNotification.countDocuments({
      status: "active",
      ...(userId && { userId }),
    }),
    GlobalNotification.countDocuments({
      status: "inactive",
      ...(userId && { userId }),
    }),
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.NotificationssCount = { total, active, inactive };
  meta.scheduled = totalScheduled;
  meta.sent = totalDelivered;
  meta.activeFilters = grandTotalFiltered;
  meta.totalReached = totalReached;

  Notificationss = Notificationss.map(notificationFormatter);

  return { Notificationss, meta };
};




const findNotificationsById = async (id) => {
  return GlobalNotification.findById(id);
};

const findByIdAndUpdate = async (id, data) => {
  return GlobalNotification.findByIdAndUpdate(id, data, { new: true });
};



const getOrganizations = async ({ skip, limit }) => {
  try {
    const pipeline = [
      {
        $project: {
          _id: 1,
          title: "$basicInfo.name",
        }
      },

      { $skip: skip || 0 },
      ...(limit ? [{ $limit: limit }] : []),
    ];

    const result = await Organizations.aggregate(pipeline);

    const organizations = result || [];
    const totalOrganizations = await Organizations.countDocuments();

    const meta = {
      total: totalOrganizations,
      filtered: organizations.length,
    };

    return { organizations, meta };
  } catch (error) {

    return {
      statusCode: 500,
      message: "Error fetching organizations",
      error,
    };
  }
};


const getEvents = async ({ skip, limit, status }) => {
  try {
    const match = {
      ...(status && { status }),
      $or: [
        { "recurringMeta.isTemplate": false },
        { "recurringMeta.isTemplate": { $exists: false } },
      ],
    };

    const pipeline = [
      { $match: match },

      {
        $project: {
          _id: 1,
          title: "$basicInfo.title",
          status: 1,
        },
      },

      { $skip: skip || 0 },
      ...(limit ? [{ $limit: limit }] : []),
    ];

    const events = await Events.aggregate(pipeline);
    const totalEvents = await Events.countDocuments(match);

    return {
      events,
      meta: {
        total: totalEvents,
        filtered: events.length,
      },
    };
  } catch (error) {
    return {
      statusCode: 500,
      message: "Error fetching events",
      error,
    };
  }
};



const gettags = async ({ skip, limit }) => {
  try {

    const pipeline = [
      {
        $project: {
          _id: 1,
          title: "$title",
        }
      },

      { $skip: skip || 0 },
      ...(limit ? [{ $limit: limit }] : []),
    ];

    const result = await Tags.aggregate(pipeline);

    const events = result || [];
    const totalEvents = await Tags.countDocuments();

    const meta = {
      total: totalEvents,
      filtered: events.length,
    };

    return { events, meta };
  } catch (error) {

    return {
      statusCode: 500,
      message: "Error fetching events",
      error,
    };
  }
};

//get notification by eventId
const getNotificationsByEventId = async (eventId, page = 1, limit = 10) => {
  const safePage = Number(page) || 1;
  const safeLimit = Number(limit) || 10;
  const skip = safeLimit === 0 ? 0 : (safePage - 1) * safeLimit;

  const pipeline = [
    {
      $match: {
        eventId: new mongoose.Types.ObjectId(eventId),
      },
    },
    {
      $lookup: {
        from: "tags",
        localField: "interests",
        foreignField: "_id",
        pipeline: [
          {
            $project: {
              _id: 1,
              title: 1,
            },
          },
        ],
        as: "interests",
      },
    },
    { $sort: { createdAt: -1 } },
    {
      $facet: {
        notifications: [
          { $skip: skip },
          ...(safeLimit ? [{ $limit: safeLimit }] : []),
        ],
        totalCount: [{ $count: "count" }],
      },
    },
  ];

  const result = await GlobalNotification.aggregate(pipeline);

  const notifications = result[0]?.notifications || [];
  const total = result[0]?.totalCount[0]?.count || 0;

  const totalPages = safeLimit === 0 ? 1 : Math.ceil(total / safeLimit);

  return {
    notifications, // ✅ RAW documents (unchanged)
    meta: {
      currentPage: safePage,

      totalRecords: total,
      totalPages,
      limit: safeLimit,
    },
  };
};


const getNotificationByOrganizationId = async (organizationId) => {
  try {
    const objectId = new mongoose.Types.ObjectId(organizationId);
    const notification = await GlobalNotification.find({ organizationId: objectId });
    return notification || null;
  } catch (error) {

    return null;
  }
};


























const getUserStats = async ({ notification }) => {
  const getCount = async (Model, baseMatch, extra = {}) => {
    const finalMatch = {
      ...baseMatch,
      ...extra,
    };
    return Model.countDocuments(finalMatch);
  };

  // Base match for notifications
  const baseMatch = {
    objectType: "GlobalNotification",
    objectId: new mongoose.Types.ObjectId(notification),
  };

  const globalNotificationData = await GlobalNotification.findOne({
    _id: new mongoose.Types.ObjectId(notification),
  });

  // Get counts for total users and users who read the notification
  const [totalUsers, totalUsersRead] = await Promise.all([
    getCount(NotificationExp, baseMatch),
    getCount(NotificationExp, baseMatch, { isRead: true }),
  ]);

  const percentageUsersRead = parseFloat(totalUsers > 0 ? (totalUsersRead / totalUsers) * 100 : 0);
  return {
    totalUsersRead: totalUsersRead,
    percentageUsersRead: parseFloat(percentageUsersRead.toFixed(2)),
    totalNotificationSent: globalNotificationData?.estimated || 0,
    totalUsersDelivered: globalNotificationData?.delivered || 0,
  };
};

const getEventsOverTimeRaw = async (notification) => {
  let year = new Date().getFullYear();
  const start = new Date(`${year}-01-01T00:00:00.000Z`);
  const end = new Date(`${year + 1}-01-01T00:00:00.000Z`);

  const result = await NotificationExp.aggregate([
    {
      $match: {
        objectType: "GlobalNotification",
        objectId: new mongoose.Types.ObjectId(notification),
        createdAt: { $gte: start, $lt: end },
      },
    },

    // 🔥 Calculate Month
    {
      $project: {
        month: { $month: "$createdAt" },
        isRead: 1,
      },
    },

    // 🔥 Group by month
    {
      $group: {
        _id: "$month",
        totalNotifications: { $sum: 1 },  // Total notifications sent (impressions)
        totalClicks: {
          $sum: {
            $cond: [{ $eq: ["$isRead", true] }, 1, 0],  // Clicks where isRead = true
          },
        },
      },
    },

    // 🔥 Calculate CTR (percentage)
    {
      $project: {
        _id: 0,
        month: "$_id",
        CTR: {
          $cond: [
            { $eq: ["$totalNotifications", 0] },
            0,  // If no notifications, CTR is 0%
            { $multiply: [{ $divide: ["$totalClicks", "$totalNotifications"] }, 100] },  // Calculate CTR percentage
          ],
        },
      },
    },
  ]);

  return result.map(item => ({
    month: item.month,
    CTR: parseFloat(item.CTR.toFixed(2)),
  }));
};
module.exports = {
  createNotifications,
  getNotificationss,
  findNotificationsById,
  findByIdAndUpdate,
  getOrganizations,
  getEvents,
  gettags,
  getNotificationsByEventId,
  getNotificationByOrganizationId,
  getUserStats,
  getEventsOverTimeRaw,

};