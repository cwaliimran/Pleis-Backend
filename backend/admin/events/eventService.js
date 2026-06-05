// services/eventService.js

const { getCurrentDateInTimezone, convertUtcToTimezone, generateMeta } = require("../../helperUtils/responseUtil");
const eventRepo = require("./eventRepository");
const { formatEventResponse } = require("./formatter/eventFormatter");
const { getTicketingsByEventId, getTicketSalesStatsService } = require("../ticketing/ticketingsService");
const { generateImmediatelyForTemplate } = require("../../config/cron/events/recurringEvents.core");
const { Events } = require("@EventsModel");
const { default: mongoose } = require("mongoose");
const { getUpdatesByEventIdService } = require("../updates/updatesService");
const { getLatestEventTransactions } = require("../transactions/repositories/unifiedTransactionsRepository");
const { formatEventOrder } = require("./formatter/formatEventOrder");
const { countEngagementService } = require("../../commonModules/appEngagement/engagementEventsService");
const { getEngagementCountsByEntity, getWeeklyEngagementStats, getEventsViewsStats, getEventMonthlyViewsStats } = require("../../commonModules/appEngagement/engagementEventsRepository");
const { getEventAudienceAnalytics } = require("../../staff/events/eventRepository");
const { nanoid } = require("nanoid");
const createEvent = async ({ data, ticketingData }, timezone) => {
  let event = await eventRepo.createEvent(data, ticketingData);
  if (!event) return null;

  if (event?.recurringMeta?.isTemplate) {
    // Fire-and-forget or await (recommended)
    await generateImmediatelyForTemplate(event._id);
  }


  return formatEventResponse(event, { timezone });
};


const buildMongoQuery = ({
  status,
  organization,
  companyOrganizer,
  startDate,
  endDate,
  keyword
}) => {
  const andArray = [];

  // Always exclude template events
  andArray.push({
    $or: [
      { "recurringMeta.isTemplate": false },
      { "recurringMeta.isTemplate": { $exists: false } }
    ]
  });

  // Status filter
  if (status) {
    andArray.push({ status });
  } else {
    andArray.push({ status: { $ne: "deleted" } });
    andArray.push({ "recurringMeta.isTemplate": { $ne: true } });
  }

  // Organization filter
  if (organization) {
    let organizationIds = [];
    if (Array.isArray(organization)) {
      organizationIds = organization;
    } else if (typeof organization === "string") {
      organizationIds = organization.split(/[, %]+/).filter(Boolean);
    }

    if (organizationIds.length > 0) {
      andArray.push({
        "basicInfo.organization": {
          $in: organizationIds.map(id => new mongoose.Types.ObjectId(id))
        }
      });
    }
  }

  // Company organizer filter (only if organization not provided)
  if (!organization && companyOrganizer) {
    andArray.push({
      companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer)
    });
  }

  // Start date filter
  if (startDate) {
    const start = new Date(startDate);
    start.setUTCHours(0, 0, 0, 0);
    andArray.push({ "schedule.startDateTime": { $gte: start } });
  }

  // End date filter
  if (endDate) {
    const end = new Date(endDate);
    end.setUTCHours(23, 59, 59, 999);
    andArray.push({ "schedule.endDateTime": { $lte: end } });
  }

  // Keyword search
  if (keyword) {
    andArray.push({
      $or: [
        { "basicInfo.title": { $regex: keyword, $options: "i" } },
        { "basicInfo.description": { $regex: keyword, $options: "i" } }
      ]
    });
  }

  // Build final query for aggregation
  if (andArray.length === 0) return {};
  if (andArray.length === 1) return andArray[0]; // Single condition, no $and needed
  return { $and: andArray }; // Multiple conditions
};

const getEvents = async ({
  page,
  limit,
  keyword,
  status,
  creator,
  startDate,
  endDate,
  organization,
  companyOrganizer,
  sortBy,
  sortOrder,
  timezone,

}) => {



  const query = {};
  const queryMongo = buildMongoQuery({
    status,
    organization,
    companyOrganizer,
    startDate,
    endDate,
    keyword
  });

  // Always exclude template events
  query.$and = [
    {
      $or: [
        { "recurringMeta.isTemplate": false },
        { "recurringMeta.isTemplate": { $exists: false } },
      ],
    },
  ];

  if (status) {
    query.status = status;
  } else {
    query.status = { $ne: "deleted" };
    query["recurringMeta.isTemplate"] = { $ne: true };
  }

  if (organization) {
    let organizationIds = [];

    if (Array.isArray(organization)) {
      organizationIds = organization;
    } else if (typeof organization === "string") {
      organizationIds = organization.split(/[, %]+/).filter(Boolean);
    }

    if (organizationIds.length > 0) {
      query["basicInfo.organization"] = {
        $in: organizationIds.map(
          id => new mongoose.Types.ObjectId(id)
        ),
      };
    }
  }

  if (!organization && companyOrganizer) {
    query["companyOrganizer"] =
      new mongoose.Types.ObjectId(companyOrganizer);
  }

  if (startDate) {
    const start = new Date(startDate);
    start.setUTCHours(0, 0, 0, 0);
    query["schedule.startDateTime"] = { $gte: start };
  }

  if (endDate) {
    const end = new Date(endDate);
    end.setUTCHours(23, 59, 59, 999);
    query["schedule.endDateTime"] = { $lte: end };
  }

  if (keyword) {
    query.$or = [
      { "basicInfo.title": { $regex: keyword, $options: "i" } },
      { "basicInfo.description": { $regex: keyword, $options: "i" } },
    ];
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const [events, eventsCounts] = await Promise.all([
    eventRepo.getEventsWithFilters(
      queryMongo,
      skip,
      limit === 0 ? 0 : limit,
      sortBy,
      sortOrder
    ),
    eventRepo.getEventsCounts(query),
  ]);

  let {
    totalFiltered = 0,
    total = 0,
    active = 0,
    inactive = 0,
  } = eventsCounts || {};

  // Format events
  let formattedEvents = events.map(event =>
    formatEventResponse(event, { timezone })
  );

  /* =========================================================
     🔥 FETCH TICKET STATS
  ========================================================= */

  const eventIds = events.map(e => e._id);

  const [ticketStats, viewStats] = await Promise.all([
    eventRepo.getEventsTicketStats(eventIds),
    getEventsViewsStats(eventIds)
  ]);

  // Convert to maps
  const ticketMap = new Map(
    ticketStats.map(item => [
      item.event.toString(),
      {
        totalTickets: item.totalTickets,
        totalRevenue: item.totalRevenue
      }
    ])
  );

  const viewMap = new Map(
    viewStats.map(item => [
      item.event.toString(),
      item.totalViews
    ])
  );

  // Attach to formatted events
  formattedEvents = formattedEvents.map(event => {
    const ticket = ticketMap.get(event._id.toString());
    const views = viewMap.get(event._id.toString());

    return {
      ...event,
      meta: {
        ...event.meta,
        totalTickets: ticket?.totalTickets || 0,
        totalRevenue: ticket?.totalRevenue || 0,
        totalViews: views || 0
      }
    };
  });

  return {
    events: formattedEvents,
    meta: {
      page,
      limit,
      total: totalFiltered,
      tagsCount: { total, active, inactive },
    },
  };
};

const getMinimalEventsInfo = async ({ organization, timezone }) => {
  const query = {
    status: "active"
  };

  if (organization) {
    query["basicInfo.organization"] = organization;
  }
  const [events] =
    await Promise.all([
      eventRepo.getMinimalEventsWithFilters(
        query,
      ),
    ]);

  let formattedEvents = events?.map(event => formatEventResponse(event, { timezone }));

  return {
    events: formattedEvents,
  };
};

const getPublicEvents = async ({ page, limit, keyword, timezone = "Asia/Karachi" }) => {
  //remove template events from public listing
  const query = { status: "active", "recurringMeta.isTemplate": { $ne: true } };
  if (keyword) {
    query.$or = [
      { title: { $regex: keyword, $options: "i" } },
      { description: { $regex: keyword, $options: "i" } },
    ];
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const [events, totalFiltered] = await Promise.all([
    eventRepo.getEventsWithFilters(
      query,
      skip,
      limit === 0 ? 0 : limit
    ),
    eventRepo.countEvents(query),
  ]);

  return {
    events,
    meta: {
      page,
      limit,
      total: totalFiltered,
    },
  };
};

const updateEventsWithVenueLocation = async (venueId, location) => {

  const filter = { "basicInfo.venue": venueId };
  location.type = "Point";
  const update = { $set: { "basicInfo.venueLocation": location } };

  // updateMany to update all matching events and only set the location field
  const result = await eventRepo.updateMany(filter, update);

  return result;
};

/* 
now we are using updateEventService for updating events
*/
/* const updateEvent = async (id, data, scope) => {
  const event = await eventRepo.findEventById(id);
  if (!event) return null;

  const {
    basicInfo,
    otherInfo,
    operatingHours,
    status,
    venues,
    image,
    tags,
    description,
    title,
    schedule,
    promotion,
    preOrdersEnabled,
  } = data;

  // --- BASIC INFO ---
  if (basicInfo) {
    // ensure basicInfo exists
    if (!event.basicInfo) event.basicInfo = {};

    if (basicInfo.media) {
      event.basicInfo.media = {
        ...(event.basicInfo.media || {}),
        ...basicInfo.media,
      };
    }

    if (basicInfo.socialLinks) {
      event.basicInfo.socialLinks = {
        ...(event.basicInfo.socialLinks || {}),
        ...basicInfo.socialLinks,
      };
    }

    if (basicInfo.organization !== undefined)
      event.basicInfo.organization = basicInfo.organization;

    if (basicInfo.venue !== undefined)
      event.basicInfo.venue = basicInfo.venue;

    if (basicInfo.categories !== undefined)
      event.basicInfo.categories = basicInfo.categories;

    if (basicInfo.tags !== undefined)
      event.basicInfo.tags = basicInfo.tags;

    if (basicInfo.partnerOrganizer !== undefined)
      event.basicInfo.partnerOrganizer = basicInfo.partnerOrganizer;

    if (basicInfo.title !== undefined)
      event.basicInfo.title = basicInfo.title;

    if (basicInfo.description !== undefined)
      event.basicInfo.description = basicInfo.description;


    if (basicInfo.partnerOrganization !== undefined)
      event.basicInfo.partnerOrganization = basicInfo.partnerOrganization;
  }

  // --- OTHER INFO ---
  if (otherInfo) {
    if (!event.otherInfo) event.otherInfo = {};
    for (const key in otherInfo) {
      event.otherInfo[key] = otherInfo[key];
    }
  }

  // --- OPERATING HOURS ---
  if (operatingHours) {
    if (!event.operatingHours) event.operatingHours = {};
    for (const key in operatingHours) {
      event.operatingHours[key] = operatingHours[key];
    }
  }

  // --- PROMOTION ---
  if (promotion) {
    if (!event.promotion) event.promotion = {};
    for (const key in promotion) {
      event.promotion[key] = promotion[key];
    }
  }

  // --- SIMPLE FIELDS ---
  if (status !== undefined) event.status = status;
  if (venues !== undefined) event.venues = venues;
  if (image !== undefined) event.image = image;
  if (tags !== undefined) event.basicInfo.tags = tags;
  if (preOrdersEnabled !== undefined) event.preOrdersEnabled = preOrdersEnabled;

  // --- DESCRIPTION (legacy support) ---
  if (description !== undefined) {
    if (!event.otherInfo) event.otherInfo = {};
    event.otherInfo.description = description;
  }

  // --- TITLE (legacy support) ---
  if (title !== undefined) {
    if (!event.basicInfo) event.basicInfo = {};
    event.basicInfo.title = title;
  }

  // --- SCHEDULE ---
  if (schedule) {
    if (!event.schedule) event.schedule = {};
    if (schedule.type !== undefined) event.schedule.type = schedule.type;
    if (schedule.startDateTime !== undefined)
      event.schedule.startDateTime = schedule.startDateTime;
    if (schedule.endDateTime !== undefined)
      event.schedule.endDateTime = schedule.endDateTime;
    if (schedule.recurringDetails !== undefined)
      event.schedule.recurringDetails = schedule.recurringDetails;
  }

  await event.save();
  return event;
}; */


const deleteEvent = async (eventId, scope = "single") => {
  const event = await Events.findById(eventId);

  if (!event) return null;

  const { recurringMeta } = event;

  // ==================================================
  // CASE 1: Not part of recurring series
  // ==================================================
  if (!recurringMeta || (!recurringMeta.isTemplate && !recurringMeta.parentEvent)) {
    await Events.updateOne(
      { _id: eventId },
      { status: "deleted" }
    );

    return { deleted: 1 };
  }

  // ==================================================
  // CASE 2: DELETE ONLY THIS OCCURRENCE
  // ==================================================
  if (scope === "single") {
    await Events.updateOne(
      { _id: eventId },
      { status: "deleted" }
    );

    return { deleted: 1 };
  }

  // ==================================================
  // CASE 3: DELETE THIS + FUTURE OCCURRENCES
  // ==================================================
  const parentId = recurringMeta.parentEvent || event._id;
  const occurrenceIndex = recurringMeta.occurrenceIndex;

  const result = await Events.updateMany(
    {
      "recurringMeta.parentEvent": parentId,
      "recurringMeta.occurrenceIndex": { $gte: occurrenceIndex },
      status: { $ne: "deleted" }
    },
    { $set: { status: "deleted" } }
  );

  //also delete template so no future occurrences are generated
  await Events.updateOne(
    { _id: parentId },
    { status: "deleted" }
  );

  return {
    deleted: result.modifiedCount,
    scope: "future"
  };
};


const getEventDetails = async (id, timezone) => {
  const [event, updates, ticketingStats, latestEventOrders, eventViews] = await Promise.all([
    eventRepo.findEventById(id),
    getUpdatesByEventIdService(id),
    getTicketSalesStatsService(id),
    eventRepo.getLatestEventOrders({ eventId: id }),
    countEngagementService({ entityId: id, entityType: 'events', action: 'view' })

  ])
  if (!event) return null;
  let data = formatEventResponse(event, { timezone });
  data.updates = updates || [];
  let formatLatestEventOrders = latestEventOrders.map(order => {
    return formatEventOrder(order);
  });
  data.ticketingStats = ticketingStats || {};
  data.latestEventOrders = formatLatestEventOrders || [];
  data.eventViews = eventViews || 0;
  return data
};

const cloneEvent = async (id) => {
  const event = await eventRepo.findEventById(id);
  if (!event) return null;

  const clonedData = JSON.parse(JSON.stringify(event));
  delete clonedData._id; // Remove the original ID
  clonedData.status = "inactive"; // Set status to inactive for the clone
  clonedData.publicId = nanoid();

  return await eventRepo.createEvent(clonedData);
};

const getEventIdByNanoid = async (nanoid) => {
  const event = await eventRepo.findEventByNanoid(nanoid);
  return event ? event._id : null;
};

const getEventAnalyticsService = async (id) => {
  const [engagementStats, audienceAnalytics, monthlyViews, eventTopInterests] = await Promise.all([
    getEngagementCountsByEntity({ entityId: id, entityType: 'events', actions: ['view', 'favorite'] }),
    // getWeeklyEngagementStats({
    //   entityType: "events",
    //   entityId: id,
    //   action: "view"
    // }),
    getEventAudienceAnalytics(id),
    // eventRepo.getTicketPerformanceWeekly({ eventId: id }),
    // eventRepo.getEventRevenueAnalytics({ eventId: id }),
    getEventMonthlyViewsStats({
      entityType: "events",
      entityId: id,
      action: "view",
    }),
    eventRepo.getEventTopInterests(id, 10)
  ]);

  return {
    engagementStats: {
      views: engagementStats.view || 0,
      favorites: engagementStats.favorite || 0
    },
    // weeklyViews,
    audienceAnalytics,
    // ticketPerformanceWeekly,
    // revenueAnalytics,
    monthlyViews,
    eventTopInterests
  };
};

const getEventTicketsAnalyticsService = async (id) => {
  const [
    ticketTypeStats,
    scannedTicketProgress,
    ticketPerformanceWeekly,
    ticketingStats
  ] = await Promise.all([
    eventRepo.getTicketTypeStats({ eventId: id }),
    eventRepo.getScannedTicketProgress({ eventId: id }),
    eventRepo.getTicketPerformanceWeekly({ eventId: id }),
    getTicketSalesStatsService(id),
  ]);

  // -----------------------------------
  // SCAN INDEXING (per ticket)
  // -----------------------------------
  const scanMap = new Map(
    scannedTicketProgress.map(t => [t.ticketId.toString(), t])
  );

  const enrichedTicketTypeStats = ticketTypeStats.map(ticket => {
    const scan = scanMap.get(ticket.ticketId.toString());

    return {
      ...ticket,
      scanned: scan?.scanned || { count: 0, percentage: 0 },
      notScanned: scan?.notScanned || { count: 0, percentage: 0 },
      totalSold: scan?.totalSold || 0
    };
  });

  // -----------------------------------
  // RETURN CLEAN ANALYTICS PAYLOAD
  // -----------------------------------
  return {
    ticketTypeStats: enrichedTicketTypeStats,
    ticketPerformance: ticketPerformanceWeekly, 
    ticketingStats
  };
};


const getEventbycompanyOrganizer = async ({ companyOrganizer, timezone }) => {
  const query = {
    status: "active"
  };

  if (companyOrganizer) {
    query.companyOrganizer = companyOrganizer;
  }
  const [events] =
    await Promise.all([
      eventRepo.getEventbycompanyOrganizer(
        query,
      ),
    ]);



  return {
    events,
  };
};
const getEventsByVenueTypeService = async ({ venueTypeId, timezone }) => {
  const events = await eventRepo.getEventsByVenueType(venueTypeId);
  //format events
  const formattedEvents = events.map(event => formatEventResponse(event, { timezone }));
  return { events: formattedEvents };
};

const getEventsByTagService = async ({ tagId, timezone }) => {
  const events = await eventRepo.getEventsByTag(tagId);

  //format events
  const formattedEvents = events.map(event => formatEventResponse(event, { timezone }));
  return { events: formattedEvents };
};

const getEventsByCategoryService = async ({ categoryId, timezone }) => {
  const events = await eventRepo.getEventsByCategory(categoryId);
  //format events
  const formattedEvents = events.map(event => formatEventResponse(event, { timezone }));
  return { events: formattedEvents };
};

const getEventsBatch = async ({
  eventTags,
  eventCategories,
  eventVenueTypes,
  timezone,
}) => {
  const { events } = await eventRepo.getEventsBatchRepo({
    tagIds: [...eventTags],
    categoryIds: [...eventCategories],
    venueTypeIds: [...eventVenueTypes],
  });

  return events.map(e =>
    formatEventResponse(e, { timezone })
  );
};

module.exports = {
  createEvent,
  getEvents,
  getEventIdByNanoid,
  cloneEvent,
  deleteEvent,
  getPublicEvents,
  getEventDetails,
  updateEventsWithVenueLocation,
  getMinimalEventsInfo,
  getEventAnalyticsService,
  getEventTicketsAnalyticsService,
  getEventbycompanyOrganizer,
  getEventsByVenueTypeService,
  getEventsByTagService,
  getEventsByCategoryService,
  getEventsBatch,

};
