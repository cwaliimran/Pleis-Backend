const { buildKeywordQueryFromModels } = require("@utils/dbUtils/queryUtil");
const { generateMeta } = require("@utils/responseUtil");
const mongoose = require("mongoose");
const {Events}= require("@EventsModel");
const Giveaway = require("@GiveawayModel");
const { TicketingOrders } = require("@TicketingOrdersModel");
const  TicketingsModel  = require("@TicketingsModel");
const Organizations = require("@OrganizationModel");
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


const createGiveaway = async (data) => {
  try {
    const userIds = await getUserIdsForEvent(data.event);
    data.creator = await getCreatorOrganizationId(data.creator)
    console.log("userIds",userIds );
    const update = new Giveaway(data);
    await update.save();
        await sendUserNotifications({
            recipientIds: userIds, 
            title: update.title,
            body: `A new giveaway is live join now : ${update._id}`,
            data: { type: NotificationTypes.GIVEAWAY_UPDATE, objectType: "group",giveawayId: update._id },
            sender: update.creator,
            objectId: update.event,
          });

    return update; 
  } catch (err) {
    throw new Error("Error saving update: " + err.message); 
  }
};


const getGiveaway = async ({ timezone, page, limit, keyword, status, userId, date, range, today, skip }) => {
  let totalParticipants = 0;
  userId = await getCreatorOrganizationId(userId);  // Assuming getCreatorOrganizationId returns a valid userId

  console.log("Keyword:", keyword); // Debugging the keyword

  const pipeline = [
    {
      $match: {
        ...(userId && { creator: userId })  // Match creator if userId is provided
      }
    },

    // Step 3: Apply other filters (status, date, etc.)
    {
      $match: {
        status: status || { $ne: "deleted" }, // Default to excluding "deleted" status
        ...(date && {
          createdAt: {
            $gte: new Date(date),
            $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)), // Filter by the given date
          },
        }),
      },
    },

    // Step 4: Keyword search for multiple fields


    // Step 5: Lookup for event title (only the title field)
    {
      $lookup: {
        from: "events",  // Collection name for events
        localField: "event",  // field in Giveaway
        foreignField: "_id",  // field in Event collection
        as: "event",  // Alias for the joined data
      },
    },
    {
      $unwind: { path: "$event", preserveNullAndEmptyArrays: true },  // Flatten the 'event' array
    },

    // Step 6: Lookup for ticket title (only the title field)
    {
      $lookup: {
        from: "ticketings",  // Collection name for Ticketings
        localField: "ticket",  // field in Giveaway
        foreignField: "_id",  // field in Ticketings collection
        as: "ticket",  // Alias for the joined data
      },
    },
    {
      $unwind: { path: "$ticket", preserveNullAndEmptyArrays: true },  // Flatten the 'ticket' array
    },

    // Step 7: Lookup for giveaway participants and count total participants
    {
      $lookup: {
        from: "giveawayparticipants",  // Collection name for GiveawayParticipants
        localField: "_id",  // field in Giveaway
        foreignField: "giveaway",  // field in GiveawayParticipants
        as: "participants",  // Alias for the joined data
      },
    },
    {
      $addFields: {
        totalParticipants: { $size: { $ifNull: ["$participants", []] } },  // Count the participants, default to 0 if none
      },
    },

    ...(keyword ? [{
      $match: {
        $or: [
          { title: { $regex: keyword, $options: "i" } },  
          { "event.basicInfo.title": { $regex: keyword, $options: "i" } },  
          { "ticket.title": { $regex: keyword, $options: "i" } },  
          { $expr: { $regexMatch: { input: { $toString: "$numberOfWinners" }, regex: keyword, options: "i" } } },  
          { $expr: { $regexMatch: { input: { $toString: "$ticketsPerWinner" }, regex: keyword, options: "i" } } }, 
          { "ticketType": { $regex: keyword, $options: "i" } }, 
          { $expr: { $regexMatch: { input: { $toString: "$totalParticipants" }, regex: keyword, options: "i" } } },
          { "giveawayStatus": { $regex: keyword, $options: "i" } },  
          { $expr: { $regexMatch: { input: { $toString: "$endDateTime" }, regex: keyword, options: "i" } } }, 
        ],
      },
    }] : []),

    // Step 8: Project only the title from the ticket and event, and totalParticipants
    {
      $project: {
        eventTitle: "$event.basicInfo.title",  // Only return event title
        ticketTitle: "$ticket.title",  // Only return ticket title
        title: 1, 
        numberOfWinners: 1,
        ticketsPerWinner: 1,
        startDateTime: 1,
        endDateTime: 1,
        status: 1,
        giveawayStatus: 1,
        createdAt: 1,
        totalParticipants: 1,  // Include the totalParticipants field
      },
    },

    // Step 9: Sort by createdAt (descending)
    { $sort: { createdAt: -1 } },

    // Step 10: Apply pagination and count using $facet
    {
      $facet: {
        data: [
          { $skip: skip },  // Pagination skip
          ...(limit === 0 ? [] : [{ $limit: limit }])  // Apply limit if provided
        ],
        totalFiltered: [{ $count: "count" }],  // Total count of filtered results
      },
    },
  ];

  // Execute the aggregation pipeline
  const result = await Giveaway.aggregate(pipeline);
  console.log("Result:", result);  // Debugging the result

  // Step 11: Check if the result is valid and contains data
  if (!result || !result[0] || !result[0].data) {
    return { Giveaway: [], meta: { totalFiltered: 0, GiveawayCount: { total: 0, active: 0, inactive: 0 } } };
  }

  // Step 12: Handle the aggregation results
  let Giveaways = result[0].data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Step 13: Meta counts (active/inactive/total Giveaway for the given userId)
  const [total, active, inactive] = await Promise.all([ 
    Giveaway.countDocuments({ creator: userId, status: { $ne: "deleted" } }),  // Total Giveaway for the user
    Giveaway.countDocuments({ creator: userId, status: "active" }),  // Active Giveaway for the user
    Giveaway.countDocuments({ creator: userId, status: "inactive" })  // Inactive Giveaway for the user
  ]);

  // Step 14: Generate meta information for pagination
  const meta = generateMeta(page, limit, totalFiltered);
  meta.GiveawayCount = { total, active, inactive };

  return { Giveaways, meta };
};

const getWinners = async ({ giveawayId, timezone, page, limit, skip }) => {
  try {
    const pipeline = [
      // Step 1: Match the given giveawayId
      {
        $match: {
          _id: new mongoose.Types.ObjectId(giveawayId),  // Match the giveaway
        },
      },

      // Step 2: Lookup giveaway participants and filter only winners
      {
        $lookup: {
          from: "giveawayparticipants",  // Collection name for GiveawayParticipants
          localField: "_id",  // Field in Giveaway
          foreignField: "giveaway",  // Field in GiveawayParticipants
          as: "participants",  // Alias for the joined data
        },
      },
      {
        $unwind: { path: "$participants", preserveNullAndEmptyArrays: true },  // Flatten the 'participants' array
      },

      // Step 3: Filter only winners (where isWinner is true)
      {
        $match: {
          "participants.isWinner": true,  // Only include winners
        },
      },

      // Step 4: Lookup for user details (first name, last name, email, username)
      {
        $lookup: {
          from: "users",  // Collection name for Users
          localField: "participants.user",  // Field in GiveawayParticipants (user field)
          foreignField: "_id",  // Field in Users collection
          as: "user",  // Alias for the joined data
        },
      },
      {
        $unwind: { path: "$user", preserveNullAndEmptyArrays: true },  // Flatten the 'user' array
      },

      // Step 5: Project only necessary fields (event title, ticket title, and winner details)
      {
        $project: {
          eventTitle: 1,  // Event title from Giveaway
          ticketTitle: 1,  // Ticket title from Giveaway
          firstName: "$user.firstName",  // First name of the winner
          lastName: "$user.lastName",  // Last name of the winner
          email: "$user.email",  // Email of the winner
          username: "$user.username",  // Username of the winner
        },
      },

      // Step 6: Apply pagination and count using $facet
      {
        $facet: {
          data: [
            { $skip: skip },  // Pagination skip
            ...(limit === 0 ? [] : [{ $limit: limit }])  // Apply limit if provided
          ],
          totalFiltered: [{ $count: "count" }],  // Total count of filtered results
        },
      },
    ];

    // Execute the aggregation pipeline
    const result = await Giveaway.aggregate(pipeline);

    // Check if the result is valid and contains data
    if (!result || !result[0] || !result[0].data) {
      return { winners: [], meta: { totalFiltered: 0 } };
    }

    // Handle the aggregation results
    const winners = result[0].data || [];
    const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

    // Meta information for pagination
    const meta = { totalFiltered };

    return { winners, meta };
  } catch (err) {
    throw new Error("Error retrieving winners: " + err.message);
  }
};



const findGiveawayById = async (id) => {
  return Giveaway.findById(id);
};

const findByIdAndUpdate = async (id, data) => {
  return Giveaway.findByIdAndUpdate(id, data, { new: true });
};



const getCreatorOrganizationId = async (organizationId) => {
  try {

    // Find the organization by its ID
    const organization = await Organizations.findById(organizationId).select('creator').lean();

    // Return the creator's organizationId
    return organization.creator;  // Directly return the creator's ID

  } catch (error) {
    return { message: 'Error fetching organization' };
  }
};

const getevents = async ({
  timezone,
  page,
  limit,
  keyword,
  status,
  organizationId,
  date,
  skip
}) => {

   let userId = await getCreatorOrganizationId(organizationId)
  const pipeline = [
    // Step 1: Match events where creator matches the provided userId
    {
      $match: {
        ...(userId && { creator: userId }) // Filter events where creator == userId
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





const gettickets = async ({
  timezone,
  page,
  limit,
  keyword,
  status,
  userId,
  date,
  skip,
  eventId
}) => {
  const pipeline = [
    // Step 1: Match events where creator matches the provided userId
    {
      $match: {
        ...(eventId && { event: new mongoose.Types.ObjectId(eventId) }) // Filter events where creator == userId
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
        "title": { $regex: keyword, $options: "i" } // Case-insensitive search for keyword in the title
      }
    });
  }

  // Step 4: Project only the fields we need (_id and title)
  pipeline.push({
    $project: {
      _id: 1, // Include _id
     title: "$title" // Include title from basicInfo
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
  const result = await TicketingsModel.aggregate(pipeline);

  // Step 7: Check if result is valid and contains data
  if (!result || !result[0] || !result[0].data) {
    return { events: [], meta: { totalFiltered: 0, eventsCount: { total: 0, active: 0, inactive: 0 } } };
  }

  // Step 8: Handle aggregation results
  let tickets = result[0].data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Step 9: Meta counts (active/inactive/total events for the given userId)
  const [total, active, inactive] = await Promise.all([
    TicketingsModel.countDocuments({ creator: userId, status: { $ne: "deleted" } }), // Total events for the user
    TicketingsModel.countDocuments({ creator: userId, status: "active" }), // Active events for the user
    TicketingsModel.countDocuments({ creator: userId, status: "inactive" }) // Inactive events for the user
  ]);

  // Step 10: Generate meta information for pagination
  const meta = generateMeta(page, limit, totalFiltered);
  meta.eventsCount = { total, active, inactive };

  return { tickets, meta };
};
module.exports = {
  createGiveaway,
  getGiveaway,
  findGiveawayById,
  findByIdAndUpdate,
  getevents,
  getUserIdsForEvent,
  gettickets,
  getWinners

};