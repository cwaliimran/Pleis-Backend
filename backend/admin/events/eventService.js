// services/eventService.js

const { getCurrentDateInTimezone, convertUtcToTimezone, generateMeta } = require("../../helperUtils/responseUtil");
const eventRepo = require("./eventRepository");
const { formatEventResponse } = require("./formatter/eventFormatter");
const { getTicketingsByEventId, getTicketSalesStatsService } = require("../ticketing/ticketingsService");
const { generateImmediatelyForTemplate } = require("../../commonModules/events/crons/recurringEvents.core");
const { Events } = require("@EventsModel");
const { default: mongoose } = require("mongoose");
const { getUpdatesByEventIdService } = require("../updates/updatesService");
const { getLatestEventTransactions } = require("../transactions/repositories/unifiedTransactionsRepository");
const { formatEventOrder } = require("./formatter/formatEventOrder");
const { countEngagementService } = require("../../commonModules/appEngagement/engagementEventsService");
const { getEngagementCountsByEntity, getWeeklyEngagementStats } = require("../../commonModules/appEngagement/engagementEventsRepository");
const { getEventAudienceAnalytics } = require("../../staff/events/eventRepository");

const createEvent = async ({ data, ticketingData }, timezone) => {
  let event = await eventRepo.createEvent(data, ticketingData);
  if (!event) return null;

  if (event?.recurringMeta?.isTemplate) {
    // Fire-and-forget or await (recommended)
    await generateImmediatelyForTemplate(event._id);
  }


  return formatEventResponse(event, { timezone });
};

const getEvents = async ({ page, limit, keyword, status, creator, startDate, endDate, organization, timezone }) => {
  const query = {};
  // ALWAYS exclude templates events
  //templates event are only for internal use to generate occurrences
  query.$and = [
    {
      $or: [
        { "recurringMeta.isTemplate": false },
        { "recurringMeta.isTemplate": { $exists: false } },
      ],
    },
  ];

  if (creator) query.creator = creator;
  if (status) {
    query.status = status;
  } else {
    query.status = { $ne: "deleted" };
    //remove template events from normal listing
    query["recurringMeta.isTemplate"] = { $ne: true };
  }

  if (organization) {
    query["basicInfo.organization"] = new mongoose.Types.ObjectId(organization);
  }

  if (startDate) {
    query["schedule.startDateTime"] = { $gte: new Date(startDate) };
  }
  if (endDate) {
    query["schedule.endDateTime"] = { $lte: new Date(endDate) };
  }

  if (keyword) {
    query.$or = [
      { "basicInfo.title": { $regex: keyword, $options: "i" } },
      { "basicInfo.description": { $regex: keyword, $options: "i" } },
    ];
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const [events, eventsCounts] =
    await Promise.all([
      eventRepo.getEventsWithFilters(
        query,
        skip,
        limit === 0 ? 0 : limit
      ),
      eventRepo.getEventsCounts(query),
    ]);

  let { totalFiltered = 0, total = 0, active = 0, inactive = 0 } = eventsCounts || {};

  let formattedEvents = events.map(event => formatEventResponse(event, { timezone }));

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

  return await eventRepo.createEvent(clonedData);
};

const getEventIdByNanoid = async (nanoid) => {
  const event = await eventRepo.findEventByNanoid(nanoid);
  return event ? event._id : null;
};

const getEventAnalyticsService = async (id) => {
  const [engagementStats, weeklyViews, audienceAnalytics, ticketPerformanceWeekly, revenueAnalytics] = await Promise.all([
    getEngagementCountsByEntity({ entityId: id, entityType: 'events', actions: ['view', 'favorite'] }),
    getWeeklyEngagementStats({
      entityType: "events",
      entityId: id,
      action: "view"
    }),
    getEventAudienceAnalytics(id),
    eventRepo.getTicketPerformanceWeekly({ eventId: id }),
    eventRepo.getEventRevenueAnalytics({ eventId: id })
  ]);

  return {
    engagementStats: {
      views: engagementStats.view || 0,
      favorites: engagementStats.favorite || 0
    },
    weeklyViews,
    audienceAnalytics,
    ticketPerformanceWeekly,
    revenueAnalytics
  };
};

const getEventTicketsAnalyticsService = async (id) => {
  const [paidVsUnpaidTicketStats, scannedTicketProgress, ticketPerformanceWeekly,
    ticketingStats
  ] = await Promise.all([
    eventRepo.getPaidVsUnpaidTicketStats({ eventId: id }),
    eventRepo.getScannedTicketProgress({ eventId: id }),
    eventRepo.getTicketPerformanceWeekly({ eventId: id }),
    getTicketSalesStatsService(id),

  ]);

  return {
    paidVsUnpaidTicketStats,
    scannedTicketProgress,
    ticketPerformanceWeekly,
    ticketingStats
  };
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
  getEventTicketsAnalyticsService
};
