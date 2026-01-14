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
const Organizations = require("@OrganizationModel");
const { Events } = require("@EventsModel");
const { User } = require("@UserModel");
const { sendUserNotifications } = require("../../controllers/communicationController");
const { NotificationTypes } = require("@NotificationsModel");
const { notificationFormatter } = require("./helper/notificationFormatter");
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
  const pipeline = [];

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
    const users = await User.find({}, { _id: 1 }).lean();
    return users.map(user => user._id.toString());
  } catch (err) {
    throw err;
  }
};

const createNotifications = async (data) => {
  try {

    const result = await getFilteredUserIdsCombined({
      ageRange: data.ageRange || null,
      gender: data.gender || null,
      interests: data.interests || [],
      center: data.center || null,
      radius: data.radius ?? 0,
    });
    if (!data.ageRange && !data.gender && !data.interests && !data.center && !data.radius) {
      const allUserIds = await getAllUserIds();
      result.userIds = allUserIds;
    }

    const notificationSystemType =
      data.organizationId
        ? NotificationTypes.ORGANIZATION_DETAILS
        : data.eventId
          ? NotificationTypes.EVENT_DETAILS
          : NotificationTypes.HOME;


    let globalNotification = null;

    /* ===============================
       HOME NOTIFICATION
    =============================== */
    if (data.destinationType === "homeNotification") {
      if (data.sendTiming === "immediately") {
        await sendUserNotifications({
          recipientIds: result.userIds,
          title: data.title,
          body: `You received a new message: ${data.description}`,
          data: {
            type: notificationSystemType,
            objectType: "group",
          },
          sender: data.creator,
          objectId: data.eventId || data.organizationId || data.creator,
        });

        data.isDelivered = true;
        data.estimated = result.userIds.length;
        data.delivered = result.userIds.length;

        const Model = getModelByTaskType(data.destinationType);
        globalNotification = new Model(data);
        await globalNotification.save();
      }
      if (data.sendTiming === "schedule") {
        data.estimated = result.userIds.length;
        const Model = getModelByTaskType(data.destinationType);
        globalNotification = new Model(data);
        await globalNotification.save();
      }
    }

    /* ===============================
       ORGANIZATION NOTIFICATION
    =============================== */
    else if (data.destinationType === "organizationNotification") {
      if (data.sendTiming === "immediately") {
        await sendUserNotifications({
          recipientIds: result.userIds,
          title: data.title,
          body: `You received a new message: ${data.description}`,
          data: {
            type: notificationSystemType,
            objectType: "group",
          },
          sender: data.creator,
          objectId: data.organizationId,
        });
        data.isDelivered = true;
        data.estimated = result.userIds.length;
        data.delivered = result.userIds.length;
        const Model = getModelByTaskType(data.destinationType);
        globalNotification = new Model(data);
        await globalNotification.save();
      }
      if (data.sendTiming === "schedule") {
        data.estimated = result.userIds.length;
        const Model = getModelByTaskType(data.destinationType);
        globalNotification = new Model(data);
        await globalNotification.save();
      }
    }

    /* ===============================
       EVENT NOTIFICATION
    =============================== */
    else if (data.destinationType === "eventNotification") {
      if (data.sendTiming === "immediately") {
        await sendUserNotifications({
          recipientIds: result.userIds,
          title: data.title,
          body: `You received a new message: ${data.description}`,
          data: {
            type: notificationSystemType,
            objectType: "group",
          },
          sender: data.creator,
          objectId: data.eventId,
        });
        data.isDelivered = true;
        data.estimated = result.userIds.length;
        data.delivered = result.userIds.length;
        const Model = getModelByTaskType(data.destinationType);
        globalNotification = new Model(data);
        await globalNotification.save();
      }
      if (data.sendTiming === "schedule") {
        data.estimated = result.userIds.length;
        const Model = getModelByTaskType(data.destinationType);
        globalNotification = new Model(data);
        await globalNotification.save();
      }
    }

    return globalNotification;
  } catch (err) {
    throw err;
  }
};


const getNotificationss = async ({isDelivered, sendTiming,timezone, page, limit, keyword, status, userId, date, range, today, skip }) => {

  const pipeline = [
    {
      $match: {
        ...(userId && { creator: new mongoose.Types.ObjectId(userId) }),
      },
    },
  ];

  if (range == "monthly") {
    const { start, end } = getStartAndEndOfMonth(today, timezone);

    pipeline.push({
      $match: {
        createdAt: { $gte: start, $lt: end },
      },
    });
  }

  if (range == "weekly") {
    const { start, end } = getStartAndEndOfWeek(today, timezone);

    pipeline.push({
      $match: {
        createdAt: { $gte: start, $lt: end },
      },
    });
  }

  if (range == "today") {
    const start = new Date(today);
    const end = new Date(new Date(today).setDate(start.getDate() + 1));

    pipeline.push({
      $match: {
        createdAt: { $gte: start, $lt: end },
      },
    });
  }


  if (status) {
    pipeline.push({ $match: { status } });
  } else {
    pipeline.push({ $match: { status: { $ne: "deleted" } } });
  }
  if (sendTiming) {
    pipeline.push({ $match: { sendTiming } });
  }
  if (isDelivered) {
    if (isDelivered === "true") isDelivered = true;
    if (isDelivered === "false") isDelivered = false;
    if (typeof isDelivered === "boolean") {
      pipeline.push({
        $match: { isDelivered }
      });
    }
  }
  if (date) {
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    pipeline.push({
      $match: {
        createdAt: { $gte: start, $lt: end },
      },
    });
  }

  if (keyword) {
    const keywordMatch = buildKeywordQueryFromModels(
      [{ schema: GlobalNotification.schema }],
      keyword
    );

    if (Object.keys(keywordMatch).length) {
      pipeline.push({ $match: keywordMatch });
    }
  }

  // Add organization and event title lookup if present
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
              "basicInfo.name": 1
            }
          }
        ]
      }
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
              "basicInfo.title": 1
            }
          }
        ]
      }
    },
    {
      // ✅ Convert arrays → single object
      $addFields: {
        organization: { $arrayElemAt: ["$organization", 0] },
        event: { $arrayElemAt: ["$event", 0] }
      }
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
      }
    }
  );


  pipeline.push({ $sort: { createdAt: -1 } });

  // Apply pagination + counts using $facet
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
            count: { $sum: { $ifNull: ["$estimated", 0] } }
          }
        }
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
        { $match: { "location.city": { $exists: true, $ne: null } } }, // Ensure city exists and is not null
        { $count: "count" },
      ],
      totalAgeFiltered: [
        { $match: { ageRange: { $exists: true, $ne: [] } } }, // Ensure ageRange is not empty
        { $count: "count" },
      ],
      totalInterestsFiltered: [
        { $match: { interests: { $exists: true, $ne: [] } } }, // Ensure interests are not empty
        { $count: "count" },
      ],
      // Gender filter (non-array type)
      totalGenderFiltered: [
        { $match: { gender: { $nin: [null, []] } } }, // Ensure gender is not an array or null
        { $count: "count" },
      ],
      grandTotalFiltered: [
        {
          $addFields: {
            totalLocation: {
              $ifNull: [{ $arrayElemAt: ["$totalLocationFiltered.count", 0] }, 0] // Use count directly
            },
            totalAge: {
              $ifNull: [{ $arrayElemAt: ["$totalAgeFiltered.count", 0] }, 0] // Use count directly
            },
            totalInterests: {
              $ifNull: [{ $arrayElemAt: ["$totalInterestsFiltered.count", 0] }, 0] // Use count directly
            },
            totalGender: {
              $ifNull: [{ $arrayElemAt: ["$totalGenderFiltered.count", 0] }, 0] // Use count directly
            },
          },
        },
        {
          $addFields: {
            grandTotal: {
              $sum: [
                "$totalLocation",
                "$totalAge",
                "$totalInterests",
                "$totalGender", // Correctly summing all filtered totals
              ],
            },
          },
        },
        { $count: "grandTotal" },
      ],
    },
  });


  const result = await GlobalNotification.aggregate(pipeline);


  let Notificationss = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;
  const totalScheduled = result[0]?.totalScheduled[0]?.count || 0;
  const totalDelivered = result[0]?.totalDelivered[0]?.count || 0;
  const totalLocationFiltered = result[0]?.totalLocationFiltered[0]?.count || 0;
  const totalAgeFiltered = result[0]?.totalAgeFiltered[0]?.count || 0;
  const totalInterestsFiltered = result[0]?.totalInterestsFiltered[0]?.count || 0;
  const totalReached = result[0]?.totalReached[0]?.count || 0;

  const totalGenderFiltered = result[0]?.totalGenderFiltered[0]?.count || 0;
  const grandTotalFiltered = totalInterestsFiltered + totalLocationFiltered + totalAgeFiltered + totalGenderFiltered;

  // Additional counts for meta (active/inactive/total by userId as creator)
  const [total, active, inactive] = await Promise.all([
    GlobalNotification.countDocuments({
      ...(userId && { userId: userId }),
      status: { $ne: "deleted" },
    }),
    GlobalNotification.countDocuments({
      status: "active",
      ...(userId && { userId: userId }),
    }),
    GlobalNotification.countDocuments({
      status: "inactive",
      ...(userId && { userId: userId }),
    }),
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.NotificationssCount = { total, active, inactive };
  meta.scheduled = totalScheduled;
  meta.sent = totalDelivered;
  // meta.totalLocationFiltered = totalLocationFiltered;
  // meta.totalAgeFiltered = totalAgeFiltered;
  // meta.totalInterestsFiltered = totalInterestsFiltered;
  // meta.activeFilters = totalGenderFiltered;
  meta.activeFilters = grandTotalFiltered; // Grand total of all filters combined
  meta.totalReached = totalReached;
  const filteredNotifications = (result[0]?.data || []).map(notificationFormatter);
  Notificationss = filteredNotifications;

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


const getEvents = async ({ skip, limit }) => {
  try {

    const pipeline = [
      {
        $project: {
          _id: 1,
          title: "$basicInfo.title",
        }
      },

      { $skip: skip || 0 },
      ...(limit ? [{ $limit: limit }] : []),
    ];

    const result = await Events.aggregate(pipeline);

    const events = result || [];
    const totalEvents = await Events.countDocuments();

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
const getNotificationsByEventId = async (eventId) => {
  return GlobalNotification.find({ eventId: new mongoose.Types.ObjectId(eventId) })
    .sort({ createdAt: -1 })
}


module.exports = {
  createNotifications,
  getNotificationss,
  findNotificationsById,
  findByIdAndUpdate,
  getOrganizations,
  getEvents,
  gettags,
  getNotificationsByEventId,

};