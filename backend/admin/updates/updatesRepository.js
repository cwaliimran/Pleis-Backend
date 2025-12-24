const { buildKeywordQueryFromModels } = require("@utils/dbUtils/queryUtil");
const { generateMeta } = require("@utils/responseUtil");
const mongoose = require("mongoose");
const {Events}= require("@EventsModel");
const Updates = require("@UpdatesModel");
const { TicketingOrders } = require("@TicketingOrdersModel");
const { UserReservations } = require("@UserReservationsModel");
const { formatUpdate } = require("./formatters/updateFormatter");
const {NotificationExp, NotificationTypes} = require("@NotificationsModel");
const {sendUserNotifications} = require("../../controllers/communicationController");
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


const getUpdatess = async ({ timezone, page, limit, keyword, status, userId, date, range, today, skip }) => {
  const pipeline = [
    // Step 1: Match updates where the companyOrganizer matches the provided userId
    {
      $match: {
        ...(userId && { companyOrganizer: new mongoose.Types.ObjectId(userId) })
      }
    }
  ];

  // Step 2: Apply range filters (monthly, weekly, today)
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

  // Step 3: Apply other filters (status, date, etc.)
  if (status) {
    pipeline.push({ $match: { status } });
  } else {
    pipeline.push({ $match: { status: { $ne: "deleted" } } }); // Default to excluding "deleted" status
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

  // Step 4: Keyword search for event title
  if (keyword) {
    // Search only in the 'title' field of the update
    pipeline.push({
      $match: {
        title: { $regex: keyword, $options: "i" } // Case-insensitive search
      }
    });
  }

  // Step 5: Lookup the event's title from the Events collection
  pipeline.push({
    $lookup: {
      from: "events", // Events collection
      localField: "event", // Match the event field in Updates
      foreignField: "_id", // Match the _id of the event in Events collection
      as: "eventDetails" // Output the event details in an array called eventDetails
    }
  });

  // Step 6: Project the necessary fields (_id, title of the update, event title)
  pipeline.push({
    $project: {
      _id: 1, // Include the _id field
      image: 1, // Include the image field
      description: 1, // Include the description field
      status: 1, // Include the status field
      createdAt: 1, // Include the createdAt field
      title: 1, // Include the title field of the update
creater:{ $arrayElemAt: ["$eventDetails.creator", 0] },
      eventTitle: { $arrayElemAt: ["$eventDetails.basicInfo.title", 0] },
      eventId: { $arrayElemAt: ["$eventDetails._id", 0] } // Extract the event title from the
      //  eventDetails array
    }
  });

  // Step 7: Sort by createdAt (descending)
  pipeline.push({ $sort: { createdAt: -1 } });

  // Step 8: Apply pagination and count using $facet
  pipeline.push({
    $facet: {
      data: [
        { $skip: skip }, // Pagination skip
        ...(limit === 0 ? [] : [{ $limit: limit }]) // Apply limit if provided
      ],
      totalFiltered: [{ $count: "count" }] // Total count of filtered results
    }
  });

  // Execute the aggregation pipeline
  const result = await Updates.aggregate(pipeline);

  // Step 9: Check if the result is valid and contains data
  if (!result || !result[0] || !result[0].data) {
    return { updates: [], meta: { totalFiltered: 0, updatesCount: { total: 0, active: 0, inactive: 0 } } };
  }

  // Step 10: Handle the aggregation results
  let updates = result[0].data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Step 11: Meta counts (active/inactive/total updates for the given userId)
  const [total, active, inactive] = await Promise.all([
    Updates.countDocuments({ creator: userId, status: { $ne: "deleted" } }), // Total updates for the user
    Updates.countDocuments({ creator: userId, status: "active" }), // Active updates for the user
    Updates.countDocuments({ creator: userId, status: "inactive" }) // Inactive updates for the user
  ]);

  // Step 12: Generate meta information for pagination
  const meta = generateMeta(page, limit, totalFiltered);
  meta.updatesCount = { total, active, inactive };
 const formattedupdates = updates.map(event => formatUpdate(event));
  return { updates:formattedupdates, meta };
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
  skip
}) => {
  const pipeline = [
    // Step 1: Match events where creator matches the provided userId
    {
      $match: {
        ...(userId && { creator: new mongoose.Types.ObjectId(userId) }) // Filter events where creator == userId
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