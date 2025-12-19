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
const {calculateAge} = require("../notifications/helper/calculateAge");
const {User} = require("@UserModel");
const { calculateDistance } = require("@utils/calculateDistance");
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
    const objectId =new mongoose.Types.ObjectId(userId); 

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


const getFilteredUserIds = async (filters, referenceLocationLat, referenceLocationLon, radius) => {
  const { location, ageRange, gender, interests } = filters;

  try {
    const pipeline = [];
    let locationFilteredUserIds = new Set();
    let ageFilteredUserIds = new Set();
    let genderFilteredUserIds = new Set();
    let interestsFilteredUserIds = new Set();

    if (location && location.city) {
      console.log("Location filter applied: city =", location.city);

      // Match users by city in the location
      pipeline.push({
        $match: {
          "location.city": location.city, // Match city name
        }
      });

      // Fetch all users in the city
      const locationFilteredUsers = await User.find({ "location.city": location.city, "location.coordinates": { $exists: true } });

      // Loop through users and calculate the distance from the reference location
      locationFilteredUsers.forEach(user => {
        const userLat = user.location.coordinates[1]; // Latitude (second value in coordinates)
        const userLon = user.location.coordinates[0]; // Longitude (first value in coordinates)

        // Calculate distance between user and reference location
        const { distance } = calculateDistance(userLat, userLon, referenceLocationLat, referenceLocationLon, "kilometer");

        // Log the distance for each user
        console.log(`User ${user._id} is ${distance} km away from the reference location.`);

        // If the user is within the radius, add them to the locationFilteredUserIds set
        if (distance <= radius) {
          locationFilteredUserIds.add(user._id.toString());
        }
      });

      console.log("Location Filtered User IDs: ", [...locationFilteredUserIds]);

      // If no users match the location filter, return empty
      if (locationFilteredUserIds.size === 0) {
        return { userIds: [], meta: { totalFiltered: 0 } };
      }
    }

    // Age Range Filter
    if (ageRange && ageRange.length === 2) {
      console.log("Age range filter applied: ", ageRange);

      // Match users with a valid dob first
      pipeline.push({
        $match: {
          dob: { $ne: "" } // Ensure dob is not an empty string
        }
      });

      pipeline.push({
        $addFields: {
          age: {
            $let: {
              vars: {
                birthDate: { $toDate: "$dob" },  // Convert dob to Date
                referenceDate: new Date()        // Current date for comparison
              },
              in: {
                // Calculate age in years (divide by the number of milliseconds in a year)
                $divide: [
                  { $subtract: ["$$referenceDate", "$$birthDate"] },
                  31557600000 // Number of milliseconds in a year (365.25 days)
                ]
              }
            }
          }
        }
      });

      // Match users within the age range
      pipeline.push({
        $match: {
          age: { 
            $gte: ageRange[0], // Lower bound of age range
            $lte: ageRange[1], // Upper bound of age range
          }
        }
      });

      // Run the aggregation for age range filter
      const ageRangeFilteredUsers = await User.aggregate(pipeline);
      ageFilteredUserIds = new Set(ageRangeFilteredUsers.map(user => user._id.toString()));
      console.log("Age Range Filtered User IDs: ", [...ageFilteredUserIds]);

      // If age filter returns no users, return empty result
      if (ageFilteredUserIds.size === 0) {
        return { userIds: [], meta: { totalFiltered: 0 } };
      }
    }

    // Gender Filter
    if (gender && gender !== "all") {
      console.log("Gender filter applied: ", gender);
      pipeline.push({
        $match: {
          gender: { $regex: `^${gender}$`, $options: 'i' }  // Case-insensitive match
        }
      });

      // Run the aggregation for gender filter
      const genderFilteredUsers = await User.aggregate(pipeline);
      genderFilteredUserIds = new Set(genderFilteredUsers.map(user => user._id.toString()));
      console.log("Gender Filtered User IDs: ", [...genderFilteredUserIds]);

      // If gender filter returns no users, return empty result
      if (genderFilteredUserIds.size === 0) {
        return { userIds: [], meta: { totalFiltered: 0 } };
      }
    }

    // Interests Filter
    if (interests && interests.length > 0) {
      console.log("Interests filter applied: ", interests);

      // First, lookup categories based on the titles provided in the interests array
      pipeline.push(
        {
          $lookup: {
            from: "categories",  // Categories collection
            let: { interestTitles: interests },  // Pass the interests array as a variable
            pipeline: [
              {
                $match: {
                  $expr: {
                    $in: ["$title", "$$interestTitles"],  // Match category title against the interests
                  },
                },
              },
              {
                $project: {
                  _id: 1,  // Return the category ID
                },
              },
            ],
            as: "matchedCategories",  // Alias for the matched categories
          }
        },
        {
          $unwind: {
            path: "$matchedCategories", // Unwind the matched categories array
            preserveNullAndEmptyArrays: true,  // Allow documents without matching categories
          }
        },
        {
          $lookup: {
            from: "userinterests",  // UserInterests collection
            localField: "matchedCategories._id",  // Match category ID
            foreignField: "categories",  // Match against the "categories" field in userInterests
            as: "userInterests",  // Alias for the matched user interests
          }
        },
        {
          $unwind: {
            path: "$userInterests",  // Unwind the userInterests array
            preserveNullAndEmptyArrays: true,  // Keep documents even if no matching userInterests are found
          }
        },
        {
          $project: {
            userId: "$userInterests.user",  // Include the user ID from the userInterests collection
          }
        }
      );

      // Run the aggregation for interests filter
      const interestsFilteredUsers = await User.aggregate(pipeline);
      interestsFilteredUserIds = new Set(interestsFilteredUsers.map(user => user._id.toString()));
      console.log("Interests Filtered User IDs: ", [...interestsFilteredUserIds]);

      // If interests filter returns no users, return empty result
      if (interestsFilteredUserIds.size === 0) {
        return { userIds: [], meta: { totalFiltered: 0 } };
      }
    }

    // Step 5: Combine all filtered user IDs by taking the intersection of all results
    let finalUserIds = [...locationFilteredUserIds];

    // If there are multiple sets, perform intersection logic
    if (ageFilteredUserIds.size > 0) {
      finalUserIds = finalUserIds.filter(id => ageFilteredUserIds.has(id));
    }
    if (genderFilteredUserIds.size > 0) {
      finalUserIds = finalUserIds.filter(id => genderFilteredUserIds.has(id));
    }
    if (interestsFilteredUserIds.size > 0) {
      finalUserIds = finalUserIds.filter(id => interestsFilteredUserIds.has(id));
    }

    // Make the final list unique by using a Set (removes duplicates)
    finalUserIds = [...new Set(finalUserIds)];

    console.log("Final Filtered User IDs (intersection of all filters): ", finalUserIds);

    return { userIds: finalUserIds, meta: { totalFiltered: finalUserIds.length } };
  } catch (error) {
    console.error("Error fetching filtered user IDs:", error);
    return { userIds: [], meta: { totalFiltered: 0 } }; // Return empty result on error
  }
};



const createNotifications = async (data) => {
  try {
    const Model = getModelByTaskType(data.destinationType);
    const globalNotification = new Model(data);
    await globalNotification.save();
    const filters = {
  location:data.location,
  ageRange:data.ageRange,
  gender: data.gender,
  interests: data.interests,
  referenceLocationLat: data.location.lat,
  referenceLocationLon: data.location.long,
  radius: data.location.radius

};
const userLocation = await getUserLocationById(data.creator);

const result = await getFilteredUserIds(filters, data.referenceLocationLat, data.referenceLocationLon, data.radius);

console.log("result",result );
return
    if(data.sendTiming==="immediately"){
      const filters = {
  location: data.location, 
  ageRange: data.ageRange, 
  gender: data.gender, 
  interests: data.interests,
};



      data.isDelivered=true;
      data.estimated=userIds.length;
      data.delivered=userIds.length;
      if(data.destinationType=="organization"){

          await sendUserNotifications({
            recipientIds: userIds, // Send notification to each participant
            title: data.title,
            body: `You received a new message: ${data.description}`,
            data: { type: NotificationTypes.EVENT_UPDATE, objectType: "group" },
            sender: data.companyOrganizer,
            objectId: data.event,
          });
        }
              if(data.destinationType=="event"){

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
module.exports = {
  createNotifications,
  getNotificationss,
  findNotificationsById,
  findByIdAndUpdate,
  getOrganizations,
  getEvents

};