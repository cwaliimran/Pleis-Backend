const { buildKeywordQueryFromModels } = require("@utils/dbUtils/queryUtil");
const { generateMeta } = require("@utils/responseUtil");
const mongoose = require("mongoose");
const {
  GlobalNotification,
  GlobalNotificationEvent,
  GlobalNotificationOrganization,
  GlobalNotificationhome
} = require("../../commonModules/notifications");
const Organizations = require("@OrganizationModel");
const { Events } = require("@EventsModel");
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











const createNotifications = async (data) => {
  try {
    const Model = getModelByTaskType(data.destinationType);
    console.log("Model", Model); console.log("data", data.destinationType);
    const globalNotification = new Model(data);
    await globalNotification.save();
    return globalNotification;
  } catch (err) {
    throw err;
  }
};

const getNotificationss = async ({ timezone, page, limit, keyword, status, userId, date, range, today, skip }) => {
  console.log("user", userId);

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

  // Apply filters
  if (status) {
    pipeline.push({ $match: { status } });
  } else {
    pipeline.push({ $match: { status: { $ne: "deleted" } } });
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
        from: "organizations", // Name of the organizations collection
        localField: "organizationId",
        foreignField: "_id",
        as: "organizationDetails",
      },
    },
    {
      $lookup: {
        from: "events", // Name of the events collection
        localField: "eventId",
        foreignField: "_id",
        as: "eventDetails",
      },
    },
    {
      $addFields: {
        organizationTitle: { $arrayElemAt: ["$organizationDetails.basicInfo.name", 0] },
        eventTitle: { $arrayElemAt: ["$eventDetails.basicInfo.title", 0] },
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
        eventId: 1,
        organizationId: 1,
        eventTitle: 1, // Including event title
        organizationTitle: 1, // Including organization title
      },
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
  console.log("result", result);

  let Notificationss = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;
  const totalScheduled = result[0]?.totalScheduled[0]?.count || 0;
  const totalDelivered = result[0]?.totalDelivered[0]?.count || 0;
  const totalLocationFiltered = result[0]?.totalLocationFiltered[0]?.count || 0;
  const totalAgeFiltered = result[0]?.totalAgeFiltered[0]?.count || 0;
  const totalInterestsFiltered = result[0]?.totalInterestsFiltered[0]?.count || 0;

  const totalGenderFiltered = result[0]?.totalGenderFiltered[0]?.count || 0;
  const grandTotalFiltered = totalInterestsFiltered+totalLocationFiltered+totalAgeFiltered+totalGenderFiltered;

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
  meta.totalScheduled = totalScheduled;
  meta.totalDelivered = totalDelivered;
  meta.totalLocationFiltered = totalLocationFiltered;
  meta.totalAgeFiltered = totalAgeFiltered;
  meta.totalInterestsFiltered = totalInterestsFiltered;

  meta.totalGenderFiltered = totalGenderFiltered;
  meta.grandTotalFiltered = grandTotalFiltered; // Grand total of all filters combined

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
    console.error(error);
    return {
      statusCode: 500,
      message: "Error fetching organizations",
      error,
    };
  }
};


const getEvents = async ({ skip, limit }) => {
  try {
    console.log("skip", skip, "limit", limit);
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
    console.error(error);
    return {
      statusCode: 500,
      message: "Error fetching events",
      error,
    };
  }
};
module.exports = {
  createNotifications,
  getNotificationss,
  findNotificationsById,
  findByIdAndUpdate,
  getOrganizations,
  getEvents

};