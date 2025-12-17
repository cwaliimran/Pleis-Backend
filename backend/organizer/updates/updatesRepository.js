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
  // Log organizationIds to debug
  console.log("organizationIds:", organizationIds);

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
console.log("events",events );
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
  // Step 1: Check if organizations are provided
  if (!organizations || organizations.length === 0) {
    console.log('No organizations provided, using userId only');
  } else {
    // Ensure organizations is an array if it's a string
    if (typeof organizations === 'string') {
      try {
        // URL-decode and split the string into an array
        organizations = decodeURIComponent(organizations).split(','); // Split by comma
      } catch (error) {
        console.error('Error parsing organizations:', error);
        return { updates: [], meta: { totalFiltered: 0, updatesCount: { total: 0, active: 0, inactive: 0 } } }; // Return empty array if error
      }
    }

    // Check if organizations is now an array
    if (!Array.isArray(organizations)) {
      console.error('Organizations is not an array:', organizations);
      return { updates: [], meta: { totalFiltered: 0, updatesCount: { total: 0, active: 0, inactive: 0 } } }; // Return empty array if not an array
    }
  }

  let eventIds = [];
  if (organizations && organizations.length > 0) {
    const orgIds = organizations.map(id => new mongoose.Types.ObjectId(id));

    // Step 2: If organizations are provided, fetch event IDs for the organizations
    eventIds = await getEventIdsForOrganizations(orgIds); // Get event IDs based on organizations
    console.log("eventIds:", eventIds); // Log eventIds to ensure they are correct
  }

  // Step 3: If no eventIds are found, return an empty array with meta counts
  if (eventIds.length === 0 && organizations.length > 0) {
    console.log('No events found for the provided organizations');
    return { updates: [], meta: { totalFiltered: 0, updatesCount: { total: 0, active: 0, inactive: 0 } } };
  }

  // Step 4: Create the aggregation pipeline
  const pipeline = [
    {
      $match: {
        ...(eventIds.length > 0 && { event: { $in: eventIds } }), // Use eventIds to filter events
        ...(!organizations.length && { companyOrganizer: new mongoose.Types.ObjectId(userId) })  // Fallback to userId if no eventIds found
      }
    }
  ];

  // Apply filters based on range
  if (range === "monthly") {
    const { start, end } = getStartAndEndOfMonth(today, timezone);
    pipeline.push({
      $match: {
        createdAt: { $gte: start, $lt: end }
      }
    });
  }

  if (range === "weekly") {
    const { start, end } = getStartAndEndOfWeek(today, timezone);
    pipeline.push({
      $match: {
        createdAt: { $gte: start, $lt: end }
      }
    });
  }

  if (range === "today") {
    const start = new Date(today);
    const end = new Date(new Date(today).setDate(start.getDate() + 1));
    pipeline.push({
      $match: {
        createdAt: { $gte: start, $lt: end }
      }
    });
  }

  // Apply filters based on status, date, and keyword
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
        createdAt: { $gte: start, $lt: end }
      }
    });
  }

  if (keyword) {
    pipeline.push({
      $match: {
        title: { $regex: keyword, $options: "i" } // Case-insensitive search
      }
    });
  }

  // Lookup the event's title from the Events collection
  pipeline.push({
    $lookup: {
      from: "events",
      localField: "event",
      foreignField: "_id",
      as: "eventDetails"
    }
  });

  // Project the necessary fields
  pipeline.push({
    $project: {
      _id: 1,
      image: 1,
      description: 1,
      status: 1,
      createdAt: 1,
      title: 1,
      eventTitle: { $arrayElemAt: ["$eventDetails.basicInfo.title", 0] },
      eventId: { $arrayElemAt: ["$eventDetails._id", 0] }
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





const getevents = async ({
  timezone,
  page,
  limit,
  keyword,
  status,
  userId,
  date,
  skip,
  organizations
}) => {
  if (!organizations || organizations.length === 0) {

    organizations = [userId];  // Use userId as the "organization" in this case
  } else {
    // Ensure organizations is an array if it's a string
    if (typeof organizations === 'string') {
      try {
        // URL-decode and split the string into an array
        organizations = decodeURIComponent(organizations).split(','); // Split by comma
      } catch (error) {

        return { updates: [], meta: { totalFiltered: 0, updatesCount: { total: 0, active: 0, inactive: 0 } } }; // Return empty if error
      }
    }

    // Check if organizations is now an array
    if (!Array.isArray(organizations)) {

      return { updates: [], meta: { totalFiltered: 0, updatesCount: { total: 0, active: 0, inactive: 0 } } }; // Return empty if not an array
    }
  }

  // Convert organizations to ObjectId (if not already)
  const orgIds = organizations.map(id => new mongoose.Types.ObjectId(id));

  // Fetch creatorIds for the organizations (if organizations are provided)
  const creatorIds = organizations.length > 0 ? await getCreatorIdsForOrganizations(orgIds) : [];


  // Step 1: Create the aggregation pipeline
  const pipeline = [
    {
$match: {
      // If organizations are provided, use creatorIds or orgIds; otherwise, use userId
      ...(organizations && organizations.length > 0
        ? { creator: { $in: creatorIds.length > 0 ? creatorIds : orgIds } }  // Match by creator IDs or orgIds
        : { creator: new mongoose.Types.ObjectId(userId) })  // Fallback to matching by userId if no organizations
    }
    }
  ];

  // Step 2: Apply filters for status, date, etc.
  if (status) {
    pipeline.push({ $match: { status } });
  } else {
    pipeline.push({ $match: { status: { $ne: "deleted" } } }); // Default filter to exclude 'deleted' status
  }

  if (date) {
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    pipeline.push({
      $match: {
        createdAt: { $gte: start, $lt: end } // Filter events based on the provided date
      }
    });
  }

  // Step 3: Apply keyword search
  if (keyword) {
    // Search only in the 'title' field inside 'basicInfo'
    pipeline.push({
      $match: {
        "basicInfo.title": { $regex: keyword, $options: "i" } // Case-insensitive search for keyword in the title
      }
    });
  }

  // Step 4: Project only the fields we need (_id and title)
  pipeline.push({
    $project: {
      _id: 1, // Include _id
     title: "$basicInfo.title" // Include title from basicInfo
    }
  });

  // Step 5: Sort by createdAt (descending order)
  pipeline.push({ $sort: { createdAt: -1 } });

  // Step 6: Apply pagination + total count using $facet
  pipeline.push({
    $facet: {
      data: [
        { $skip: skip }, // Pagination skip
        ...(limit === 0 ? [] : [{ $limit: limit }]) // Apply limit if provided
      ],
      totalFiltered: [{ $count: "count" }] // Total count of events
    }
  });

  // Execute aggregation
  const result = await Events.aggregate(pipeline);

  // Step 7: Check if result is valid and contains data
  if (!result || !result[0] || !result[0].data) {
    return { events: [], meta: { totalFiltered: 0, eventsCount: { total: 0, active: 0, inactive: 0 } } };
  }

  // Step 8: Handle aggregation results
  let events = result[0].data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Step 9: Meta counts (active/inactive/total events for the given userId)
  const [total, active, inactive] = await Promise.all([
    Events.countDocuments({ creator: userId, status: { $ne: "deleted" } }), // Total events for the user
    Events.countDocuments({ creator: userId, status: "active" }), // Active events for the user
    Events.countDocuments({ creator: userId, status: "inactive" }) // Inactive events for the user
  ]);

  // Step 10: Generate meta information for pagination
  const meta = generateMeta(page, limit, totalFiltered);
  meta.eventsCount = { total, active, inactive };

  return { events, meta };
};
module.exports = {
  createUpdates,
  getUpdatess,
  findUpdatesById,
  findByIdAndUpdate,
  getevents,
  getUserIdsForEvent

};