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
const { calculateAge } = require("../notifications/helper/calculateAge");
const { User } = require("@UserModel");
const { calculateDistance } = require("@utils/calculateDistance");
const { UserInterests } = require("@UserInterests");
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

const getUserLocationById = async (userId) => {
  try {

    // Convert the userId to ObjectId if it's not already
    const objectId = new mongoose.Types.ObjectId(userId);

    // Query the Users collection to find the user by their ID and get their location coordinates
    const user = await User.findById(objectId).select('location.coordinates');

    // If user is found and the coordinates are available
    if (user && user.location && user.location.coordinates) {
      const userLat = user.location.coordinates[1]; // Latitude (second value in coordinates)
      const userLon = user.location.coordinates[0]; // Longitude (first value in coordinates)

      return { lat: userLat, lon: userLon }; // Return the latitude and longitude
    }

    // If no location found, return null
    return { lat: null, lon: null };
  } catch (error) {

    return { lat: null, lon: null }; // Return null in case of error
  }
};




const ageRangeFilter = async (ageRange) => {
  if (!Array.isArray(ageRange) || ageRange.length !== 2) {
    return new Set();
  }
  const pipeline = [
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
              {
                $subtract: [
                  new Date(),
                  { $toDate: "$dob" }
                ]
              },
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
    },
    {
      $project: {
        _id: 1
      }
    }
  ];
  const users = await User.aggregate(pipeline);
  const userIds = new Set(users.map(u => u._id.toString()));
  return userIds;
};

const genderFilter = async (gender) => {
  if (!gender || gender.toLowerCase() === "all") {
    const users = await User.find({}, { _id: 1 }).lean();
    return new Set(users.map(u => u._id.toString()));
  }
  const users = await User.find(
    {
      gender: { $regex: `^${gender}$`, $options: "i" }
    },
    { _id: 1 }
  ).lean();

  const userIds = new Set(users.map(u => u._id.toString()));
  return userIds;
};
const locationFilter = async ({
  center,
  radius,
  limit = 500
}) => {
  const users = await User.aggregate([
    {
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
    },
    { $limit: limit },
    {
      $project: {
        _id: 1
      }
    }
  ]);
  return users.map(u => u._id.toString());
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




const getFilteredUserIds = async (filters, center, radius) => {
  let { ageRange, gender, interests } = filters;
  let locationFilteredUserIds = new Set();
  let ageFilteredUserIds = new Set();
  let genderFilteredUserIds = new Set();
  let interestsFilteredUserIds = new Set();
  [
    locationFilteredUserIds,
    ageFilteredUserIds,
    interestsFilteredUserIds,
    genderFilteredUserIds
  ] = await Promise.all([
    center ? locationFilter({ center, radius }).then(ids => new Set(ids)) : Promise.resolve(new Set()),
    ageRange && ageRange.length === 2 ? ageRangeFilter(ageRange) : Promise.resolve(new Set()),
    interests && interests.length > 0 ? interestFilter(interests) : Promise.resolve(new Set()),
    gender ? genderFilter(gender) : Promise.resolve(new Set())
  ]);

  console.log("Location Filtered User IDs:", [...locationFilteredUserIds]);
  console.log("Age Range Filtered User IDs:", [...ageFilteredUserIds]);
  console.log("Interests Filtered User IDs:", [...interestsFilteredUserIds]);
  console.log("Gender Filtered User IDs:", [...genderFilteredUserIds]);
  const finalUserIds = [
    ...locationFilteredUserIds,
    ...ageFilteredUserIds,
    ...genderFilteredUserIds,
    ...interestsFilteredUserIds
  ];

  // Remove duplicates
  const uniqueUserIds = [...new Set(finalUserIds)];

  console.log(
    "Final Filtered User IDs (unique from all filters):",
    uniqueUserIds
  );

  return {
    userIds: uniqueUserIds,
    meta: { totalFiltered: uniqueUserIds.length }
  };
}



const createNotifications = async (data) => {
  try {
    const Model = getModelByTaskType(data.destinationType);
    const globalNotification = new Model(data);
    await globalNotification.save();
    const filters = {
      ageRange: data.ageRange || null,
      gender: data.gender || null,
      interests: data.interests || [],
    };
    const result = await getFilteredUserIds(filters, data.center, data.radius);

    console.log("result", result);
    return
    if (data.sendTiming === "immediately") {
      const filters = {
        center: data.center || null,
        ageRange: data.ageRange || null,
        gender: data.gender || null,
        interests: data.interests || [],
        radius: data.radius ?? 0
      };



      data.isDelivered = true;
      data.estimated = userIds.length;
      data.delivered = userIds.length;
      if (data.destinationType == "organization") {

        await sendUserNotifications({
          recipientIds: userIds, // Send notification to each participant
          title: data.title,
          body: `You received a new message: ${data.description}`,
          data: { type: NotificationTypes.EVENT_UPDATE, objectType: "group" },
          sender: data.companyOrganizer,
          objectId: data.event,
        });
      }
      if (data.destinationType == "event") {

        await sendUserNotifications({
          recipientIds: userIds, // Send notification to each participant
          title: data.title,
          body: `You received a new message: ${data.description}`,
          data: { type: NotificationTypes.EVENT_UPDATE, objectType: "group" },
          sender: data.companyOrganizer,
          objectId: data.event,
        });

      }


    }
    return globalNotification;
  } catch (err) {
    throw err;
  }
};

const getNotificationss = async ({ timezone, page, limit, keyword, status, userId, date, range, today, skip }) => {


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


  let Notificationss = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;
  const totalScheduled = result[0]?.totalScheduled[0]?.count || 0;
  const totalDelivered = result[0]?.totalDelivered[0]?.count || 0;
  const totalLocationFiltered = result[0]?.totalLocationFiltered[0]?.count || 0;
  const totalAgeFiltered = result[0]?.totalAgeFiltered[0]?.count || 0;
  const totalInterestsFiltered = result[0]?.totalInterestsFiltered[0]?.count || 0;

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
module.exports = {
  createNotifications,
  getNotificationss,
  findNotificationsById,
  findByIdAndUpdate,
  getOrganizations,
  getEvents,
  gettags

};