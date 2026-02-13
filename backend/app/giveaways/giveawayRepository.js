const { buildKeywordQueryFromModels } = require("@utils/dbUtils/queryUtil");
const { generateMeta, getCurrentDateInTimezone } = require("@utils/responseUtil");
const mongoose = require("mongoose");
const { Events } = require("@EventsModel");
const Giveaway = require("@GiveawayModel");
const GiveawayParticipant = require("@GiveawayParticipantModel");
const { TicketingOrders } = require("@TicketingOrdersModel");
const TicketingsModel = require("@TicketingsModel");
const Organizations = require("@OrganizationModel");
const { UserReservations } = require("@UserReservationsModel");
const { formatUpdate } = require("./formatters/updateFormatter");
const { NotificationExp, NotificationTypes } = require("@NotificationsModel");
const { sendUserNotifications } = require("../../controllers/communicationController");
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
const getGiveawayDetails = async (giveawayId) => {
  try {
    // Fetch the giveaway details by its ID
    const giveaway = await Giveaway.findById(giveawayId)
      .populate("organization");
    if (!giveaway) {
      throw new Error("Giveaway not found");
    }
    return {
      organization: giveaway.organization._id,
      status: giveaway.status,
      giveawayStatus: giveaway.giveawayStatus
    };
  } catch (err) {
    throw new Error("Error fetching giveaway details: " + err.message);
  }
};


const createGiveaway = async (data) => {
  try {
    // Get the giveaway details first
    const giveawayDetails = await getGiveawayDetails(data.giveaway);


    // Check if the status is not 'active' or giveawayStatus is not 'live'
    if (giveawayDetails.status !== 'active' || giveawayDetails.giveawayStatus !== 'live') {
      throw new Error("Giveaway is not active or not live.");
    }
    const existingParticipation = await GiveawayParticipant.findOne({
      giveaway: data.giveaway,
      user: data.user,
    });
    if (existingParticipation) {
      throw new Error("You have already participated in this giveaway.");
    }
    data.organization = giveawayDetails.organization;
    const update = new GiveawayParticipant(data);
    await update.save();
    await sendUserNotifications({
      recipientIds: [update.user.toString()],
      title: "Successful Participate in giveaway",
      body:`You have successfully participated in the giveaway.`,
      data: {
        type: NotificationTypes.GIVEAWAY_UPDATE,
        objectType: "Giveaway",
        organization_id: update.organization.toString(),
      },
      image: "noimage",
      sender: update.user,
      objectId: update._id,
    });
    return update;
  } catch (err) {
    throw new Error("Error saving update: " + err.message);
  }
};




const getGiveaway = async ({ eventId, timezone, page, limit, keyword, status, userId, date, range, today, skip }) => {
  let totalParticipants = 10;
  const pipeline = [
    {
      $match: {
        ...(eventId && { event: eventId })  // Match event if eventId is provided
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

    // Step 4: Filter out expired giveaways based on `endDateTime`
    {
      $match: {
        endDateTime: { $gte: new Date() }  // Only include giveaways where `endDateTime` is in the future
      },
    },

    // Step 5: Keyword search for multiple fields
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

    // Step 6: Lookup for event title (only the title field)
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

    // Step 7: Lookup for ticket title (only the title field)
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

    // Step 8: Project only the fields we need
    {
      $project: {
        eventTitle: "$event.basicInfo.title",  // Only return event title
        title: 1,
        startDateTime: 1,
        endDateTime: 1,
        status: 1,
        giveawayStatus: 1,
        createdAt: 1,
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

//get giveaways by event id
const getGiveawaysByEventId = async (eventId, timezone) => {
  let now = getCurrentDateInTimezone({ timezone });
  let giveaways = await Giveaway.find({ event: eventId, status: { $eq: "active" }, endDateTime: { $gte: now } }).sort({ createdAt: -1 });
  return giveaways;
};


module.exports = {
  createGiveaway,
  getGiveaway,
  findGiveawayById,
  findByIdAndUpdate,
  getUserIdsForEvent,
  getGiveawaysByEventId,
  getGiveawaysByEventId

};