// repositories/eventRepository.js
const { Events } = require("@EventsModel");
const TicketingsModel = require("@TicketingsModel");
const { getModelCounts, } = require('@dbUtils/queryUtil');
const mongoose = require("mongoose");
const { TicketingOrders } = require("@TicketingOrdersModel");
const { TicketingBookings } = require("@TicketingBookingsModel");
const { getAllUsers } = require("../usersManagement/usersService");
const { sendUserNotifications } = require("@notificationsUtil");
const { NotificationTypes } = require("@NotificationsModel");
const { getOrgCompanyOrganizer } = require("../organizations/organizationRepository");
const Venues = require("../../commonModules/venues/Venues");


const createEvent = async (data, ticketingData) => {
  const session = await Events.startSession();


  const companyOrganizer = await getOrgCompanyOrganizer(data.basicInfo.organization)
  data.companyOrganizer = companyOrganizer
  if (ticketingData) {
    ticketingData.companyOrganizer = companyOrganizer
    ticketingData.organization = data.basicInfo.organization
  }
  // const userIds = (await getAllUsers({ page: 1, limit: 1000000 })).users.map(user => user._id.toString());
  session.startTransaction();

  try {
    // const isAvailable = await isEventStartTimeAvailableForOrganization({
    //   organizationId: data.basicInfo.organization,
    //   startDateTime: data.schedule.startDateTime,
    // });

    // if (!isAvailable) {
    //   throw new Error(
    //     "Another event already exists for this organization at the same start time"
    //   );
    // }

    let event = new Events(data);
    event = await event.save({ session });


    if (ticketingData) {
      if (data.recurringMeta?.isTemplate) {
        ticketingData.recurringMeta = {
          isTemplate: true,
          parentTicket: null,
          occurrenceIndex: 1,
        };
      }

      ticketingData.event = event._id; // 🔑 binds ticketing to template or one-time event
      ticketingData.isTemplate = data.recurringMeta?.isTemplate || false; // mark ticketing as template if event is template
      const ticketing = new TicketingsModel(ticketingData);
      await ticketing.save({ session });
    }

    await session.commitTransaction();
    session.endSession();
    //  sendUserNotifications({
    //   recipientIds: userIds,
    //   title: `A new event ${event.basicInfo.title} has been created.`,
    //   body: `A new event ${event.basicInfo.title} is now available in the system.`,
    //   data: { type: NotificationTypes.EVENT_UPDATE, eventId: event._id, objectType: "events" },
    //   sender: event.creator,
    //   objectId: event._id,
    //   image: event.basicInfo.media.type === 'image' ? event.basicInfo.media.name : null,

    // });
    return event;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
};


// Get all with filters
// const getEventsWithFilters = async (query, skip, limit, sortBy, sortOrder) => {
//   console.log("query",query );
//   let sortField = "schedule.startDateTime";
//   let sortDirection = -1;
//   if (sortBy && sortOrder) {
//     // Map logical sortBy to actual field
//     switch (sortBy) {
//       case "venueName":
//         sortField = "basicInfo.venue.title";
//         break;
//       case "organizationName":
//         sortField = "basicInfo.organization.basicInfo.name";
//         break;
//       case "eventName":
//         sortField = "basicInfo.title"; // assuming your event name is in basicInfo.title
//         break;
//     }

//     sortDirection = sortOrder === "asc" ? 1 : -1;
//   }
//   console.log("sortField",sortField );
//   console.log("sortDirection", sortDirection);

//   return Events.find(query)
//     .populate("basicInfo.venue", "title location floorPlan")
//     .populate("basicInfo.categories", "title image")
//     .populate("basicInfo.tags", "title")
//     .populate("basicInfo.organization", "basicInfo.name basicInfo.media otherInfo.description")
//     .populate("basicInfo.partnerOrganization", "basicInfo.name basicInfo.media otherInfo.description")
//     .sort({ [sortField]: sortDirection })
//     .skip(skip)
//     .limit(limit);
// };


const getEventsWithFilters = async (
  queryMongo,
  skip = 0,
  limit = 10,
  sortBy,
  sortOrder
) => {

  // Helper to safely convert query to $and format for aggregation

  const pipeline = [
    { $match: queryMongo },

    // Lookup venue
    {
      $lookup: {
        from: "venues",
        localField: "basicInfo.venue",
        foreignField: "_id",
        as: "venueData"
      }
    },
    { $unwind: { path: "$venueData", preserveNullAndEmptyArrays: true } },

    // Lookup organization
    {
      $lookup: {
        from: "organizations",
        localField: "basicInfo.organization",
        foreignField: "_id",
        as: "organizationData"
      }
    },
    { $unwind: { path: "$organizationData", preserveNullAndEmptyArrays: true } },

    // Lookup partner organization
    {
      $lookup: {
        from: "organizations",
        localField: "basicInfo.partnerOrganization",
        foreignField: "_id",
        as: "partnerOrganizationData"
      }
    },
    { $unwind: { path: "$partnerOrganizationData", preserveNullAndEmptyArrays: true } },

    // Lookup categories
    {
      $lookup: {
        from: "categories",
        localField: "basicInfo.categories",
        foreignField: "_id",
        as: "categoriesData"
      }
    },

    // Lookup tags
    {
      $lookup: {
        from: "tags",
        localField: "basicInfo.tags",
        foreignField: "_id",
        as: "tagsData"
      }
    }
  ];
  // Determine sort direction
  let sortDirection = sortOrder === "asc" ? 1 : -1;

  if (sortBy === "organizationName") {
    // Case-insensitive sort for organization name
    pipeline.push({
      $addFields: {
        organizationNameForSort: {
          $toLower: { $ifNull: ["$organizationData.basicInfo.name", ""] }
        }
      }
    });

    pipeline.push({
      $sort: {
        organizationNameForSort: sortDirection,
        // Tie-breaker: lowercase event title
        eventTitleForSort: 1
      }
    });

  } else if (sortBy === "eventName") {
    // Case-insensitive sort for event title
    pipeline.push({
      $addFields: {
        eventTitleForSort: { $toLower: { $ifNull: ["$basicInfo.title", ""] } }
      }
    });

    pipeline.push({ $sort: { eventTitleForSort: sortDirection } });

  } else if (sortBy === "venueName") {
    // Case-insensitive sort for venue title
    pipeline.push({
      $addFields: {
        venueNameForSort: { $toLower: { $ifNull: ["$venueData.title", ""] } }
      }
    });

    pipeline.push({ $sort: { venueNameForSort: sortDirection } });

  } else {
    // Default sort by schedule.startDateTime
    pipeline.push({ $sort: { "schedule.startDateTime": sortDirection } });
  }

  // Pagination
  pipeline.push({ $skip: skip });
  if (limit > 0) pipeline.push({ $limit: limit });

  // Execute aggregation
  let events = await Events.aggregate(pipeline);

  // Format results to match your current populate structure
  events = events.map(event => {
    return {
      ...event,
      basicInfo: {
        ...event.basicInfo,
        venue: event.venueData || null,
        venueLocation: event.venueData?.location || null,
        organization: event.organizationData || null,
        partnerOrganization: event.partnerOrganizationData || null,
        categories: event.categoriesData || [],
        tags: event.tagsData || []
      }
    };
  });

  return events;
};
// Get all with filters
const getMinimalEventsWithFilters = async (query) => {

  return Events.find(query).select("basicInfo.title schedule")
    .sort({ createdAt: -1 })
};



const getEventsCounts = async (query) => {
  return getModelCounts({ model: Events, filterQuery: query });
}

// Count by condition
const countEvents = async (query = {}) => {
  return Events.countDocuments(query);
};

// Find by ID
const findEventById = async (id) => {
  return Events.findById(id)
    .populate({
      path: "basicInfo.venue",
      select: "title location floorPlan venueType",
      populate: {
        path: "venueType",
        select: "title",
      },
    })
    .populate({ path: "basicInfo.categories", select: "title image otherInfo", options: { sort: { title: 1 } } })
    .populate({ path: "basicInfo.tags", select: "title otherInfo", options: { sort: { title: 1 } } })
    .populate({
      path: "basicInfo.organization",
      select:
        "basicInfo.media.logo basicInfo.name otherInfo.description operatingHours",
    })
    .populate({
      path: "basicInfo.partnerOrganization",
      select:
        "basicInfo.name otherInfo.description basicInfo.media.logo",
    });
};


// Delete
const deleteEventById = async (event) => {
  return await event.deleteOne();
};

// Optional: keep this only for non-nested shallow updates
const findByIdAndUpdate = async (id, data) => {
  return Events.findByIdAndUpdate(id, { $set: data }, { new: true });
};

// Aggregate pipeline
const aggregateEvents = async (pipeline) => {
  return Events.aggregate(pipeline)
    .option({ allowDiskUse: true }) // Optional: helpful for large datasets
    .exec();
};

const updateMany = async (filter, update) => {
  return Events.updateMany(filter, update);
};

const findEventByNanoid = async (nanoid) => {
  return Events.findOne({ publicId: nanoid }).select("_id");
}

const getEventIdsByOrganization = async (organization) => {
  return Events.find({ "basicInfo.organization": organization }).select("_id");
}
/**
 * Checks whether an organization already has an event
 * at the same startDateTime (excluding deleted events)
 *
 * @returns {boolean} true if available, false if conflict exists
 */
const isEventStartTimeAvailableForOrganization = async ({
  organizationId,
  startDateTime,
  excludeEventId = null,
}) => {
  const query = {
    "basicInfo.organization": organizationId,
    "schedule.startDateTime": startDateTime,
    status: { $ne: "deleted" },
  };

  if (excludeEventId) {
    query._id = { $ne: excludeEventId };
  }

  const existingEvent = await Events.findOne(query).select("_id");

  return !existingEvent;
};


const getLatestEventOrders = async ({
  eventId,
  limit = 10,
  skip = 0
}) => {
  return TicketingOrders.aggregate([
    /* 1️⃣ Match event ticket orders */
    {
      $match: {
        event: new mongoose.Types.ObjectId(eventId),
        purpose: "eventTicketPurchase"
      }
    },

    /* 2️⃣ Sort newest first */
    {
      $sort: { createdAt: -1 }
    },

    /* 3️⃣ Pagination */
    { $skip: skip },
    { $limit: limit },

    /* 4️⃣ Populate user (minimal fields only) */
    {
      $lookup: {
        from: "users",
        localField: "user",
        foreignField: "_id",
        as: "user"
      }
    },
    {
      $unwind: {
        path: "$user",
        preserveNullAndEmptyArrays: true
      }
    },

    /* 5️⃣ Shape final response */
    {
      $project: {
        _id: 1,
        createdAt: 1,
        status: 1,
        ticketsPurchased: 1,

        orderPricing: 1,
        paymentDetails: 1,

        user: {
          _id: "$user._id",
          firstName: "$user.firstName",
          lastName: "$user.lastName",
          profileIcon: "$user.profileIcon"
        }
      }
    }
  ]);
};


const getTicketPerformanceWeekly = async ({ eventId, timezone = "UTC" }) => {
  const eventObjectId = new mongoose.Types.ObjectId(eventId);

  const event = await Events.findById(eventObjectId)
    .select("schedule.startDateTime schedule.endDateTime")
    .lean();

  if (!event) return [];

  const startDate = event.schedule?.startDateTime;
  const now = new Date();

  const endDate =
    event.schedule?.endDateTime && event.schedule.endDateTime < now
      ? event.schedule.endDateTime
      : now;

const rows = await TicketingBookings.aggregate([
  {
    $lookup: {
      from: "ticketingorders",
      localField: "order",
      foreignField: "_id",
      as: "order"
    }
  },
  { $unwind: "$order" },

  {
    $match: {
      "order.event": eventObjectId,
      "order.status": { $in: ["paid", "completed"] }
    }
  },

  {
    $addFields: {
      date: {
        $dateToString: {
          format: "%Y-%m-%d",
          date: "$createdAt",
          timezone
        }
      }
    }
  },

  {
    $group: {
      _id: "$date",
      value: { $sum: 1 }
    }
  },

  { $sort: { _id: 1 } }
]);

  return rows.map(r => ({
    date: r._id,
    value: r.value
  }));
};

const getEventRevenueAnalytics = async ({
  eventId,
  timezone = "UTC",
  mode = "all"
}) => {
  const now = new Date();

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  let currentMatch = {
    event: new mongoose.Types.ObjectId(eventId),
    status: { $in: ["confirmed", "completed"] }
  };

  let previousMatch = { ...currentMatch };

  // ---------------------------
  // DATE FILTERS
  // ---------------------------
  if (mode === "thisMonth") {
    currentMatch.createdAt = { $gte: startOfMonth };
    previousMatch.createdAt = {
      $gte: startOfPrevMonth,
      $lt: startOfMonth
    };
  }

  if (mode === "lastMonth") {
    currentMatch.createdAt = {
      $gte: startOfPrevMonth,
      $lt: startOfMonth
    };
  }

  if (mode === "thisYear") {
    currentMatch.createdAt = { $gte: startOfYear };
  }

  // ---------------------------
  // AGGREGATION PIPELINE
  // ---------------------------
  const aggregateByMonth = async (match) =>
    TicketingOrders.aggregate([
      { $match: match },
      {
        $addFields: {
          month: {
            $month: { date: "$createdAt", timezone }
          }
        }
      },
      {
        $group: {
          _id: "$month",
          amount: { $sum: "$orderPricing.total" }
        }
      }
    ]);

  const [currentRows, previousRows] = await Promise.all([
    aggregateByMonth(currentMatch),
    mode === "thisMonth" ? aggregateByMonth(previousMatch) : []
  ]);

  // ---------------------------
  // NORMALIZE MONTHS
  // ---------------------------
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];

  const currentMap = {};
  const previousMap = {};

  for (const r of currentRows) {
    currentMap[r._id] = r.amount;
  }

  for (const r of previousRows) {
    previousMap[r._id] = r.amount;
  }

  const trend = months.map((m, i) => ({
    month: m,
    current: Math.round(currentMap[i + 1] || 0),
    previous: Math.round(previousMap[i + 1] || 0)
  }));

  // ---------------------------
  // TOTAL REVENUE
  // ---------------------------
  const totalRevenue = trend.reduce(
    (sum, m) => sum + m.current,
    0
  );

  return {
    totalRevenue,
    currency: "€",
    trend
  };
};

const getTicketTypeStats = async ({ eventId }) => {
  const eventObjectId = new mongoose.Types.ObjectId(eventId);

  /* --------------------------------
     1️⃣ LOAD TICKET TYPES
     -------------------------------- */
  const ticketDocs = await TicketingsModel.find({
    event: eventObjectId,
    status: { $ne: "deleted" },
  })
    .select("_id title quantity timingSlots status")
    .lean();

  const ticketMap = {};

  for (const t of ticketDocs) {
    let totalQuantity = 0;

    if (t.timingSlots?.enabled) {
      for (const d of t.timingSlots.dateTimeSlots) {
        for (const s of d.timeSlots) {
          totalQuantity += s.quantity || 0;
        }
      }
    } else {
      totalQuantity = t.quantity || 0;
    }

    ticketMap[t._id.toString()] = {
      ticketId: t._id,
      title: t.title,
      status: t.status,
      totalCreated: totalQuantity,
      sold: 0,
    };
  }

  /* --------------------------------
     2️⃣ LOAD ORDERS FOR EVENT
     -------------------------------- */
  const orders = await TicketingOrders.find({
    event: eventObjectId,
    status: { $in: ["paid", "completed"] },
  })
    .select("_id")
    .lean();

  if (!orders.length) return Object.values(ticketMap);

  const orderIds = orders.map(o => o._id);

  /* --------------------------------
     3️⃣ LOAD BOOKINGS
     -------------------------------- */
  const bookings = await TicketingBookings.find({
    order: { $in: orderIds },
  })
    .select("ticket.ticketId")
    .lean();

  /* --------------------------------
     4️⃣ PROCESS BOOKINGS
     -------------------------------- */
  for (const b of bookings) {
    const ticketId = b.ticket?.ticketId?.toString();

    if (!ticketId || !ticketMap[ticketId]) continue;

    ticketMap[ticketId].sold += 1;
  }

  /* --------------------------------
     5️⃣ FINAL RESPONSE
     -------------------------------- */
  const result = Object.values(ticketMap).map(t => ({
    ticketId: t.ticketId,
    title: t.title,
    status: t.status,
    totalCreated: t.totalCreated,
    sold: t.sold,
    remaining: Math.max(t.totalCreated - t.sold, 0),
  }));

  return result;
};





const getScannedTicketProgress = async ({ eventId }) => {
  const eventObjectId = new mongoose.Types.ObjectId(eventId);

  const stats = await TicketingBookings.aggregate([
    {
      $match: {
        "ticket.snapshot.event": eventObjectId,
        status: { $in: ["valid", "used"] }
      }
    },
    {
      $group: {
        _id: {
          ticketId: "$ticket.ticketId",
          status: "$status"
        },
        count: { $sum: 1 }
      }
    }
  ]);

  const map = new Map();

  for (const row of stats) {
    const ticketId = row._id.ticketId?.toString();
    if (!ticketId) continue;

    if (!map.has(ticketId)) {
      map.set(ticketId, {
        ticketId,
        scanned: { count: 0, percentage: 0 },
        notScanned: { count: 0, percentage: 0 },
        totalSold: 0
      });
    }

    const entry = map.get(ticketId);

    if (row._id.status === "used") entry.scanned.count = row.count;
    if (row._id.status === "valid") entry.notScanned.count = row.count;
  }

  // compute percentages per ticket
  for (const entry of map.values()) {
    entry.totalSold = entry.scanned.count + entry.notScanned.count;

    entry.scanned.percentage =
      entry.totalSold === 0
        ? 0
        : Math.round((entry.scanned.count / entry.totalSold) * 100);

    entry.notScanned.percentage =
      entry.totalSold === 0
        ? 0
        : 100 - entry.scanned.percentage;
  }

  return Array.from(map.values());
};

const getTotalEventCountByOrganizationId = async (organizationId) => {
  try {
    const objectId = new mongoose.Types.ObjectId(organizationId);

    const now = new Date();

    // Count only active & non-expired events
    const result = await Events.aggregate([
      {
        $match: {
          "basicInfo.organization": objectId,
          status: "active",

          // event end date greater than now
          "schedule.endDateTime": {
            $gt: now,
          },
        },
      },
      {
        $count: "totalEvents",
      },
    ]);

    return result.length > 0 ? result[0].totalEvents : 0;
  } catch (error) {
    return 0;
  }
};
const getLatestEventByOrganization = async (organizations) => {
  try {
    const organizationIds = organizations.map(org => org._id);
    const latestEvents = await Events.find({
      "basicInfo.organization": { $in: organizationIds },
    })
      .sort({ 'schedule.startDateTime': -1 })
      .limit(1);
    if (latestEvents.length === 0) {
      return [];
    }
    return latestEvents;
  } catch (error) {

    throw new Error('Error fetching latest event');
  }
};

const getOrganizationIdByEventId = async (eventId) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      throw new Error("Invalid event id");
    }

    const event = await Events.findById(eventId)
      .select("basicInfo.organization")
      .lean();

    if (!event) {
      return null;
    }

    return event.basicInfo.organization; // returns ObjectId
  } catch (error) {
    console.error("Error getting organization by eventId:", error);
    throw error;
  }
};
const getEventbycompanyOrganizer = async (query) => {
  try {
    const { status, companyOrganizer } = query;

    if (!companyOrganizer) return 'Company organizer ID is required';

    const event = await Events.find({
      'companyOrganizer': companyOrganizer,
      'status': status
    })
      .select('_id basicInfo.title')
      .lean();

    return event || 'No event found for this company organizer with the given status';
  } catch (error) {
    console.error(error);
    throw new Error('Error retrieving event');
  }
};


/**
 * Get total tickets + total revenue per event
 * @param {Array<string|ObjectId>} eventIds
 * @returns {Array<{ event: ObjectId, totalTickets: number, totalRevenue: number }>}
 */
const getEventsTicketStats = async (eventIds = []) => {
  if (!Array.isArray(eventIds) || eventIds.length === 0) {
    return [];
  }

  const objectIds = eventIds.map(
    (id) => new mongoose.Types.ObjectId(id)
  );

  const results = await TicketingOrders.aggregate([
    {
      $match: {
        event: { $in: objectIds },
        purpose: "eventTicketPurchase",
        status: { $in: ["paid", "completed"] },
        "paymentDetails.paymentStatus": "paid",
      },
    },
    {
      $group: {
        _id: "$event",
        totalTickets: { $sum: "$ticketsPurchased" },
        totalRevenue: { $sum: "$orderPricing.total" },
      },
    },
    {
      $project: {
        _id: 0,
        event: "$_id",
        totalTickets: 1,
        totalRevenue: 1,
      },
    },
  ]);

  return results;
};

const getEventsByVenueType = async (venueTypeId) => {

  // Step 1: Fetch venues by venueType
  const venues = await Venues.find({
    venueType: new mongoose.Types.ObjectId(venueTypeId),
    status: "active",
  }).select("_id");

  const venueIds = venues.map(v => v._id);

  // Edge case: no venues → no events
  if (venueIds.length === 0) {
    return [];
  }

  // Step 2: Query events directly
  const query = {
    "basicInfo.venue": { $in: venueIds },
    status: "active",
    "recurringMeta.isTemplate": { $ne: true }, // ✅ template filter
  };

  return Events.find(query)
    .populate("basicInfo.venue", "title location floorPlan")
    .populate("basicInfo.categories", "title image")
    .populate("basicInfo.tags", "title")
    .populate(
      "basicInfo.organization",
      "basicInfo.name basicInfo.media otherInfo.description"
    )
    .populate(
      "basicInfo.partnerOrganization",
      "basicInfo.name basicInfo.media otherInfo.description"
    )
    .sort({ "schedule.startDateTime": -1 }).limit(10);
};


const getEventsByTag = async (tagId) => {

  // Step 2: Query events directly
  const query = {
    "basicInfo.tags": tagId,
    status: "active",
    "recurringMeta.isTemplate": { $ne: true },
  };

  return Events.find(query)
    .populate("basicInfo.venue", "title location floorPlan")
    .populate("basicInfo.categories", "title image")
    .populate("basicInfo.tags", "title")
    .populate(
      "basicInfo.organization",
      "basicInfo.name basicInfo.media otherInfo.description"
    )
    .populate(
      "basicInfo.partnerOrganization",
      "basicInfo.name basicInfo.media otherInfo.description"
    )
    .sort({ "schedule.startDateTime": -1 })
    .limit(10);
};


const getEventsByCategory = async (categoryId) => {

  // Step 2: Query events directly
  const query = {
    "basicInfo.categories": categoryId,
    status: "active",
    "recurringMeta.isTemplate": { $ne: true },
  };

  return Events.find(query)
    .populate("basicInfo.venue", "title location floorPlan")
    .populate("basicInfo.categories", "title image")
    .populate("basicInfo.tags", "title")
    .populate(
      "basicInfo.organization",
      "basicInfo.name basicInfo.media otherInfo.description"
    )
    .populate(
      "basicInfo.partnerOrganization",
      "basicInfo.name basicInfo.media otherInfo.description"
    )
    .sort({ "schedule.startDateTime": -1 })
    .limit(10)
};

const getEventsBatchRepo = async ({
  tagIds = [],
  categoryIds = [],
  venueTypeIds = [],
  limit = 50,
}) => {
  const tagObjectIds = tagIds.map(id => new mongoose.Types.ObjectId(id));
  const categoryObjectIds = categoryIds.map(id => new mongoose.Types.ObjectId(id));
  const venueTypeObjectIds = venueTypeIds.map(id => new mongoose.Types.ObjectId(id));

  /* =====================================
     1️⃣ VENUE → VENUE IDS (ONLY IF NEEDED)
  ===================================== */
  let venueIds = [];
  let venueTypeMap = new Map(); // venueId → venueTypeIds

  if (venueTypeObjectIds.length) {
    const venues = await Venues.find({
      venueType: { $in: venueTypeObjectIds },
      status: "active",
    }).select("_id venueType");

    venueIds = venues.map(v => v._id);

    for (const v of venues) {
      venueTypeMap.set(
        v._id.toString(),
        v.venueType.map(x => x.toString())
      );
    }
  }

  /* =====================================
     2️⃣ BUILD $OR FILTER
  ===================================== */
  const orFilters = [];

  if (tagObjectIds.length) {
    orFilters.push({ "basicInfo.tags": { $in: tagObjectIds } });
  }

  if (categoryObjectIds.length) {
    orFilters.push({ "basicInfo.categories": { $in: categoryObjectIds } });
  }

  if (venueIds.length) {
    orFilters.push({ "basicInfo.venue": { $in: venueIds } });
  }

  if (!orFilters.length) {
    return { events: [] };
  }

  const now = new Date();

  /* =====================================
     3️⃣ MAIN QUERY (ONE CALL)
  ===================================== */
  const events = await Events.find({
    $and: [
      {
        $or: orFilters,
      },

      {
        $or: [
          {
            "schedule.endDateTime": {
              $gte: now,
            },
          },
          {
            "schedule.endDateTime": null,
            "schedule.startDateTime": {
              $gte: now,
            },
          },
        ],
      },

      {
        status: "active",
        "recurringMeta.isTemplate": { $ne: true },
      },
    ],
  })
    .populate("basicInfo.venue", "title location floorPlan venueType")
    .populate("basicInfo.categories", "title image")
    .populate("basicInfo.tags", "title")
    .populate(
      "basicInfo.organization",
      "basicInfo.name basicInfo.media otherInfo.description"
    )
    .populate(
      "basicInfo.partnerOrganization",
      "basicInfo.name basicInfo.media otherInfo.description"
    )
    .sort({ "schedule.startDateTime": -1 })
    .limit(limit)
    .lean();

  /* =====================================
     4️⃣ ATTACH VENUE TYPE MATCH INFO
  ===================================== */
  if (venueTypeMap.size) {
    for (const event of events) {
      const venueId = event?.basicInfo?.venue?._id?.toString();
      if (!venueId) continue;

      const vts = venueTypeMap.get(venueId);
      if (vts) {
        event._matchedVenueTypes = vts;
      }
    }
  }

  return { events };
};

const getActiveEventsCountForOrganizations = async (
  organizationIds = []
) => {
  if (!Array.isArray(organizationIds) || organizationIds.length === 0) {
    return [];
  }

  const objectIds = organizationIds.map(
    (id) => new mongoose.Types.ObjectId(id)
  );

  return Events.aggregate([
    {
      $match: {
        "basicInfo.organization": { $in: objectIds },
        status: "active",
        "recurringMeta.isTemplate": { $ne: true },

        $or: [
          {
            "schedule.endDateTime": {
              $gte: new Date(),
            },
          },
          {
            "schedule.endDateTime": null,
            "schedule.startDateTime": {
              $gte: new Date(),
            },
          },
        ],
      },
    },
    {
      $group: {
        _id: "$basicInfo.organization",
        count: { $sum: 1 },
      },
    },
  ]);
};

const getEventTopInterests = async (eventId, limit = 10) => {
  const eventObjectId = new mongoose.Types.ObjectId(eventId);

  const attendeePipeline = [
    {
      $match: {
        event: eventObjectId,
        purpose: "eventTicketPurchase",
        status: { $in: ["paid", "completed"] }
      }
    },

    // unique attendees
    {
      $group: {
        _id: "$user"
      }
    },

    {
      $lookup: {
        from: "userinterests",
        localField: "_id",
        foreignField: "user",
        as: "interest"
      }
    },

    {
      $unwind: "$interest"
    }
  ];

  const results = await TicketingOrders.aggregate([
    ...attendeePipeline,

    // Categories
    {
      $project: {
        ids: "$interest.categories"
      }
    },
    {
      $unwind: "$ids"
    },
    {
      $lookup: {
        from: "categories",
        localField: "ids",
        foreignField: "_id",
        as: "item"
      }
    },
    {
      $unwind: "$item"
    },
    {
      $project: {
        title: "$item.title",
        type: { $literal: "category" }
      }
    },

    // Tags
    {
      $unionWith: {
        coll: "ticketingorders",
        pipeline: [
          ...attendeePipeline,

          {
            $project: {
              ids: "$interest.tags"
            }
          },
          {
            $unwind: "$ids"
          },
          {
            $lookup: {
              from: "tags",
              localField: "ids",
              foreignField: "_id",
              as: "item"
            }
          },
          {
            $unwind: "$item"
          },
          {
            $project: {
              title: "$item.title",
              type: { $literal: "tag" }
            }
          }
        ]
      }
    },

    // Venue Types
    {
      $unionWith: {
        coll: "ticketingorders",
        pipeline: [
          ...attendeePipeline,

          {
            $project: {
              ids: "$interest.venueTypes"
            }
          },
          {
            $unwind: "$ids"
          },
          {
            $lookup: {
              from: "venuetypes",
              localField: "ids",
              foreignField: "_id",
              as: "item"
            }
          },
          {
            $unwind: "$item"
          },
          {
            $project: {
              title: "$item.title",
              type: { $literal: "venueType" }
            }
          }
        ]
      }
    },

    {
      $group: {
        _id: {
          title: "$title",
          type: "$type"
        },
        count: {
          $sum: 1
        }
      }
    },

    {
      $project: {
        _id: 0,
        title: "$_id.title",
        type: "$_id.type",
        count: 1
      }
    },

    {
      $sort: {
        count: -1,
        title: 1
      }
    },

    {
      $limit: limit
    }
  ]);

  return results;
};


const getActiveEventsForOrg = async (organizationId, now) => {
  return Events.find({
    "basicInfo.organization": organizationId,
    status: "active",
    "schedule.startDateTime": { $lte: now },
    $or: [
      { "schedule.endDateTime": { $gte: now } },
      { "schedule.endDateTime": null },
    ],
  }).select("_id basicInfo.organization companyOrganizer");
};

module.exports = {
  createEvent,
  getEventsWithFilters,
  countEvents,
  aggregateEvents,
  findEventById,
  deleteEventById,
  findByIdAndUpdate,
  updateMany,
  findEventByNanoid,
  getEventsCounts,
  getMinimalEventsWithFilters,
  getEventIdsByOrganization,
  getLatestEventOrders,
  getTicketPerformanceWeekly,
  getEventRevenueAnalytics,
  getTicketTypeStats,
  getScannedTicketProgress,
  getTotalEventCountByOrganizationId,
  getLatestEventByOrganization,
  getOrganizationIdByEventId,
  getEventbycompanyOrganizer,
  getEventsTicketStats,
  getEventsByVenueType,
  getEventsByTag,
  getEventsByCategory,
  getEventsBatchRepo,
  getActiveEventsCountForOrganizations,
  getEventTopInterests,
  getActiveEventsForOrg
};
