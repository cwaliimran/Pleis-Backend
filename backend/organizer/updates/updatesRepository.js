const { buildKeywordQueryFromModels } = require("@utils/dbUtils/queryUtil");
const { generateMeta } = require("@utils/responseUtil");
const mongoose = require("mongoose");
const Updates = require("@UpdatesModel");
const { TicketingOrders } = require("@TicketingOrdersModel");
const { UserReservations } = require("@UserReservationsModel");
const { formatUpdate } = require("./formatters/updateFormatter");
const {NotificationExp, NotificationTypes} = require("@NotificationsModel");
const {sendUserNotifications} = require("../../controllers/communicationController");
const Organizations = require("@OrganizationModel");
const {Events} = require("@EventsModel");
const getUserIdsForEvent = async (eventId) => {
  try {


    // Aggregate users from both TicketingOrders and UserReservations collections

    const ticketingUsers = await TicketingOrders.aggregate([
      {
        $match: {
          event: new mongoose.Types.ObjectId(eventId), // Match by eventId
        },
      },
      {
        $project: {
          user: 1, // Only return user field
        },
      },
      {
        $group: {
          _id: null, // No group key needed
          users: { $addToSet: "$user" }, // Collect unique users
        },
      },
    ]);

    const reservationUsers = await UserReservations.aggregate([
      {
        $match: {
          optionalEventId: new mongoose.Types.ObjectId(eventId), // Match by eventId
        },
      },
      {
        $project: {
          userId: 1, // Only return userId field
        },
      },
      {
        $group: {
          _id: null, // No group key needed
          users: { $addToSet: "$userId" }, // Collect unique users
        },
      },
    ]);

    // Safely check if we have results from both collections
    const ticketingUserIds = ticketingUsers[0]?.users || []; // Default to empty array if no users found
    const reservationUserIds = reservationUsers[0]?.users || []; // Default to empty array if no users found

    // Combine both user arrays (deduplicate using addToSet)
    const combinedUsers = [
      ...ticketingUserIds,
      ...reservationUserIds,
    ];

    // Remove duplicates by converting ObjectId to string and using Set
    const uniqueUserIds = [
      ...new Set(combinedUsers.map(userId => userId.toString())) // Convert each ObjectId to string before deduplicating
    ];
    return uniqueUserIds; // Return the list of unique user IDs
  } catch (err) {

    return []; // Return an empty array in case of an error
  }
};


const createUpdates = async (data) => {
  try {
    const update = new Updates(data); 
     const userIds = await getUserIdsForEvent(data.event);
    await update.save();
  await sendUserNotifications({
            recipientIds: userIds, // Send notification to each participant
            title: data.title,
            body: `You received a new message: ${data.description}`,
            data: { type: NotificationTypes.EVENT_UPDATE, objectType: "group" },
            sender: data.companyOrganizer,
            objectId: data.event,
          });
    return update; 
  } catch (err) {
    throw new Error("Error saving update: " + err.message); 
  }
};
const getEventIdsForOrganizations = async (organizationIds) => {


  // Use aggregation to get events where the organization matches the provided organization IDs under the basicInfo field
  const events = await Events.aggregate([
    {
      $match: {
        // Match events where the organization is in the provided organizationIds
        "basicInfo.organization": { $in: organizationIds }
      }
    },
    {
      $project: {
        _id: 1,  // Only select the _id field for the event
      }
    }
  ]);

  // Return the event IDs
  return events.map(event => event._id);
};


const getUpdatess = async ({
  organizations,
  timezone,
  page,
  limit,
  keyword,
  status,
  userId,
  date,
  range,
  today,
  skip
}) => {
  // Ensure organizations is always an array
  if (!organizations || organizations.length === 0) {

    organizations = []; // Default to an empty array if no organizations are provided
  } else {
    // Ensure organizations is an array if it's a string
    if (typeof organizations === 'string') {
      try {
        // URL-decode and split the string into an array
        organizations = decodeURIComponent(organizations).split(','); // Split by comma
      } catch (error) {

        return { updates: [], meta: { totalFiltered: 0, updatesCount: { total: 0, active: 0, inactive: 0 } } }; // Return empty array if error
      }
    }

    // Check if organizations is now an array
    if (!Array.isArray(organizations)) {

      return { updates: [], meta: { totalFiltered: 0, updatesCount: { total: 0, active: 0, inactive: 0 } } }; // Return empty array if not an array
    }
  }

  let eventIds = [];
  if (organizations.length > 0) {
    const orgIds = organizations.map(id => new mongoose.Types.ObjectId(id));

    // Step 2: If organizations are provided, fetch event IDs for the organizations
    eventIds = await getEventIdsForOrganizations(orgIds); // Get event IDs based on organizations

  }

  // Step 3: If no eventIds are found, return an empty array with meta counts
  if (eventIds.length === 0 && organizations.length > 0) {
    return { updates: [], meta: { totalFiltered: 0, updatesCount: { total: 0, active: 0, inactive: 0 } } };
  }

const pipeline = [
  {
    $match: {
      ...(eventIds.length > 0 && { event: { $in: eventIds } }),
      ...(!organizations.length && {
        companyOrganizer: new mongoose.Types.ObjectId(userId)
      })
    }
  }
];

// 🔹 Range filters
if (range === "monthly") {
  const { start, end } = getStartAndEndOfMonth(today, timezone);
  pipeline.push({
    $match: { createdAt: { $gte: start, $lt: end } }
  });
}

if (range === "weekly") {
  const { start, end } = getStartAndEndOfWeek(today, timezone);
  pipeline.push({
    $match: { createdAt: { $gte: start, $lt: end } }
  });
}

if (range === "today") {
  const start = new Date(today);
  const end = new Date(new Date(today).setDate(start.getDate() + 1));
  pipeline.push({
    $match: { createdAt: { $gte: start, $lt: end } }
  });
}

// 🔹 Status filter
if (status) {
  pipeline.push({ $match: { status } });
} else {
  pipeline.push({ $match: { status: { $ne: "deleted" } } });
}

// 🔹 Date filter
if (date) {
  const start = new Date(date);
  const end = new Date(new Date(date).setDate(start.getDate() + 1));
  pipeline.push({
    $match: { createdAt: { $gte: start, $lt: end } }
  });
}

// 🔹 Keyword filter
if (keyword) {
  pipeline.push({
    $match: {
      title: { $regex: keyword, $options: "i" }
    }
  });
}

// 🔹 Lookup Event
pipeline.push({
  $lookup: {
    from: "events",
    localField: "event",
    foreignField: "_id",
    as: "eventDetails"
  }
});

// 🔹 Extract organizationId from event
pipeline.push({
  $addFields: {
    organizationId: "$eventDetails.basicInfo.organization"
  }
});

// Lookup Organization
pipeline.push({
  $lookup: {
    from: "organizations",
    localField: "organizationId",
    foreignField: "_id",
    as: "organizationDetails"
  }
});


pipeline.push({
  $project: {
    _id: 1,
    image: 1,
    description: 1,
    status: 1,
    createdAt: 1,
    title: 1,

    eventId: { $arrayElemAt: ["$eventDetails._id", 0] },
    eventTitle: { $arrayElemAt: ["$eventDetails.basicInfo.title", 0] },

    organizationName: {
      $arrayElemAt: ["$organizationDetails.basicInfo.name", 0]
    }
  }
});


  // Sort by createdAt
  pipeline.push({ $sort: { createdAt: -1 } });

  // Apply pagination and count
  pipeline.push({
    $facet: {
      data: [
        { $skip: skip },
        ...(limit === 0 ? [] : [{ $limit: limit }])
      ],
      totalFiltered: [{ $count: "count" }]
    }
  });

  // Execute the aggregation
  const result = await Updates.aggregate(pipeline);

  if (!result || !result[0] || !result[0].data) {
    return { updates: [], meta: { totalFiltered: 0, updatesCount: { total: 0, active: 0, inactive: 0 } } };
  }

  let updates = result[0].data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  const [total, active, inactive] = await Promise.all([ 
    Updates.countDocuments({ creator: userId, status: { $ne: "deleted" } }),
    Updates.countDocuments({ creator: userId, status: "active" }),
    Updates.countDocuments({ creator: userId, status: "inactive" })
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.updatesCount = { total, active, inactive };

  const formattedUpdates = updates.map(event => formatUpdate(event));

  return { updates: formattedUpdates, meta };
};


const findUpdatesById = async (id) => {
  return Updates.findById(id);
};

const findByIdAndUpdate = async (id, data) => {
  return Updates.findByIdAndUpdate(id, data, { new: true });
};



const getevents = async ({ organizations }) => {
  try {


    // If organizations are passed as a comma-separated string, split them into an array
    if (typeof organizations === 'string') {
      organizations = organizations.split(','); // Split by comma
    }

    // If organizations are not passed or are empty, return an empty response
    if (!Array.isArray(organizations) || organizations.length === 0) {

      return { events: [], meta: { totalFiltered: 0 } };
    }

    // Convert organizations to ObjectId (if not already)
    const orgIds = organizations.map(id => new mongoose.Types.ObjectId(id));
     // Log the ObjectIds to ensure correct conversion

    // Create the aggregation pipeline
const pipeline = [
  // Match events where the organization field is in the provided list of organizations
  {
    $match: {
      "basicInfo.organization": { $in: orgIds } // Match events where the organization is in the provided orgIds (nested in basicInfo)
    }
  },
  // Lookup event details from the Events collection
  {
    $lookup: {
      from: "events",                // The collection to join (events collection)
      localField: "basicInfo.organization", // Field in the current collection (organization inside basicInfo)
      foreignField: "_id",            // Field in the events collection (_id)
      as: "eventDetails"              // Alias for the matched events
    }
  },
  // Check the eventDetails before unwinding
  {
    $addFields: {
      eventDetailsCheck: "$eventDetails" // Add a field to check the eventDetails before unwind
    }
  },
  // Project the _id and eventDetailsCheck
  {
    $project: {
      _id:1,
      title: "$basicInfo.title",
    }
  },
  // Sort by createdAt (descending order)
  {
    $sort: { createdAt: -1 }
  },
  // Pagination and counting total filtered events
  {
    $facet: {
      data: [
        { $skip: 0 }, // Pagination skip
        { $limit: 20 } // Limit results to 20
      ],
      totalFiltered: [
        { $count: "count" } // Count the total number of filtered events
      ]
    }
  }
];


    // Execute aggregation
    const result = await Events.aggregate(pipeline);


    // Handle result
    if (!result || !result[0] || !result[0].data) {

      return { events: [], meta: { totalFiltered: 0 } };
    }

    const events = result[0].data || [];
    const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

    return { events, meta: { totalFiltered } };
  } catch (error) {

    return { events: [], meta: { totalFiltered: 0 } };
  }
};





module.exports = {
  createUpdates,
  getUpdatess,
  findUpdatesById,
  findByIdAndUpdate,
  getevents,
  getUserIdsForEvent

};