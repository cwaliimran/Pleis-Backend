// services/eventService.js

const { getCurrentDateInTimezone, getStartAndEndOfDay, getStartAndEndOfWeek, generateMeta } = require("../../helperUtils/responseUtil");
const eventRepo = require("./eventRepository");
const _ = require("lodash");
const { getRecommendedEvents } = require("./recommendationSystem/eventsRecommender");
const { formatEventResponse } = require("../events/formatter/eventFormatter");
const { formatMoreFromOrganizerEventResponse,reservationsFormatterAdjustDates } = require("./formatter/eventFormatter");
const { attachVenueTypesToEvent  } = require("./formatter/eventFormatter");
const { getUserInterestsIdsForRecommendation } = require("../usersManagement/usersRepository");
const { getForYouEventsAgainstInterests } = require("./recommendationSystem/getForYouEventsAgainstInterests");
const { Favorites } = require("../../commonModules/favorites/Favorite");
const { getTicketings } = require("../ticketing/ticketingsService");
const { addOrUpdateRecentlyViewedItem } = require("../recentlyViewed/recentlyViewedItemRepository");
const { default: mongoose } = require("mongoose");


const getNearbyEvents = async (queryData) => {
  let {
    longitude = 0,
    latitude = 0,
    page = 1,
    limit = 10,
    timezone = "Asia/Karachi",
    radiusKm = 0,
    category,
    time,
  } = queryData || {};

  const catObjId = category ? new mongoose.Types.ObjectId(category) : null;
  const categoryFilter = category
    ? { "basicInfo.categories": { $in: [catObjId] } }
    : {};

  // If radiusKm is not provided, use an approximate "whole world" radius
  const rawRadiusKm =
    !radiusKm || radiusKm === "" ? 20037.5 : parseFloat(radiusKm);

  radiusKm = parseFloat(rawRadiusKm);
  longitude = parseFloat(longitude);
  latitude = parseFloat(latitude);

  if (typeof longitude !== "number" || typeof latitude !== "number") {
    throw new Error("Valid user longitude and latitude are required");
  }

  if (radiusKm <= 0) {
    throw new Error("Radius must be greater than 0");
  }

  const radiusInMeters = radiusKm * 1000;
  const now = getCurrentDateInTimezone({ timezone });
  const skip = Math.max(0, (page - 1) * limit);

  // --- Time filter ---
  let dateFilter = {};
  if (time && time !== "all") {
    let start, end;

    switch (time) {
      case "live":
        dateFilter = { "schedule.startDateTime": { $lte: now }, "schedule.endDateTime": { $gte: now } };
        break;

      case "today":
        ({ start, end } = getStartAndEndOfDay(now, timezone));
        dateFilter = { "schedule.startDateTime": { $lte: end }, "schedule.endDateTime": { $gte: start } };
        break;

      case "tomorrow":
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);
        ({ start, end } = getStartAndEndOfDay(tomorrow, timezone));
        dateFilter = { "schedule.startDateTime": { $lte: end }, "schedule.endDateTime": { $gte: start } };
        break;

      case "thisWeek":
        ({ start, end } = getStartAndEndOfWeek(now, timezone));
        dateFilter = { "schedule.startDateTime": { $lte: end }, "schedule.endDateTime": { $gte: start } };
        break;

      default:
        dateFilter = {
          $or: [
            { "schedule.endDateTime": { $gte: now } },
            { "schedule.startDateTime": { $gte: now } },
          ],
        };
    }
  } else {
    dateFilter = {
      $or: [
        { "schedule.endDateTime": { $gte: now } },
        { "schedule.startDateTime": { $gte: now } },
      ],
    };
  }

  try {
    const pipeline = [
      {
        $geoNear: {
          near: { type: "Point", coordinates: [longitude, latitude] },
          key: "basicInfo.venueLocation",
          distanceField: "distance",
          spherical: true,
          maxDistance: radiusInMeters,
          query: { status: "active", ...categoryFilter, ...dateFilter },
        },
      },
      { $project: { schedule: 1, basicInfo: 1, distance: 1 } },

      {
        $lookup: {
          from: "venues",
          localField: "basicInfo.venue",
          foreignField: "_id",
          pipeline: [{ $project: { title: 1, location: 1 } }],
          as: "basicInfo.venue",
        },
      },
      { $unwind: "$basicInfo.venue" },

      {
        $lookup: {
          from: "organizations",
          let: { orgId: "$basicInfo.organization" },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", "$$orgId"] } } },
            { $project: { basicInfo: 1 } },
          ],
          as: "basicInfo.organization",
        },
      },
      { $unwind: { path: "$basicInfo.organization", preserveNullAndEmptyArrays: true } },

      { $sort: { distance: 1 } },
      { $skip: skip },
      { $limit: parseInt(limit) },
    ];

    const events = await eventRepo.aggregateEvents(pipeline);

    // Count total without skip/limit
    const totalCountPipeline = [
      {
        $geoNear: {
          near: { type: "Point", coordinates: [longitude, latitude] },
          key: "basicInfo.venueLocation",
          distanceField: "distance",
          spherical: true,
          maxDistance: radiusInMeters,
          query: { status: "active", ...categoryFilter, ...dateFilter },
        },
      },
      { $count: "total" },
    ];

    const totalResult = await eventRepo.aggregateEvents(totalCountPipeline);
    const totalFiltered = totalResult[0]?.total || 0;

    const formattedEvents = events.map((event) =>
      formatEventResponse(event, { timezone })
    );

    const meta = generateMeta(page, limit, totalFiltered);
    return { events: formattedEvents, meta };
  } catch (error) {
    throw new Error(`Failed to fetch nearby events: ${error.message}`);
  }
};

const getNearbyEventsWithAdvanceFilters = async (queryData) => {
  let {
    longitude = 0,
    latitude = 0,
    keyword = "",
    page = 1,
    limit = 10,
    timezone = "Asia/Karachi",
    advanceFilters = {},
    userId,
    sort = "asc", // asc = oldest first, desc = latest first
  } = queryData || {};

  const {
    time,
    distanceFrom = 0,
    distanceTo = 50,
    dateFrom,
    dateTo,
    categories = [],
    venueTypes = [],
    genre = [],
    tags = [],
  } = advanceFilters;

  longitude = parseFloat(longitude);
  latitude = parseFloat(latitude);
  const distanceToMeters = distanceTo * 1000;
  const distanceFromMeters = distanceFrom * 1000;
  const skip = Math.max(0, (page - 1) * limit);
  const now = getCurrentDateInTimezone({ timezone });

  if (typeof longitude !== "number" || typeof latitude !== "number") {
    throw new Error("Valid user longitude and latitude are required");
  }

  // --- Time / Date Range Filter ---
  let dateFilter = {};
  if (dateFrom || dateTo) {
    const start = dateFrom ? new Date(dateFrom) : new Date("1970-01-01");
    const end = dateTo ? new Date(dateTo) : new Date("2999-12-31");
    dateFilter = {
      "schedule.startDateTime": { $lte: end },
      "schedule.endDateTime": { $gte: start },
    };
  } else if (time && time !== "all") {
    let start, end;
    switch (time) {
      case "live":
        dateFilter = { "schedule.startDateTime": { $lte: now }, "schedule.endDateTime": { $gte: now } };
        break;
      case "today":
        ({ start, end } = getStartAndEndOfDay(now, timezone));
        dateFilter = { "schedule.startDateTime": { $lte: end }, "schedule.endDateTime": { $gte: start } };
        break;
      case "tomorrow":
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);
        ({ start, end } = getStartAndEndOfDay(tomorrow, timezone));
        dateFilter = { "schedule.startDateTime": { $lte: end }, "schedule.endDateTime": { $gte: start } };
        break;
      case "thisWeek":
        ({ start, end } = getStartAndEndOfWeek(now, timezone));
        dateFilter = { "schedule.startDateTime": { $lte: end }, "schedule.endDateTime": { $gte: start } };
        break;
      default:
        dateFilter = { "schedule.endDateTime": { $gte: now } };
    }
  } else {
    dateFilter = { "schedule.endDateTime": { $gte: now } };
  }

  // --- Categories / Genre / Tags Filter ---
  const categoryFilter = categories.length
    ? { "basicInfo.categories": { $in: categories.map((id) => new mongoose.Types.ObjectId(id)) } }
    : {};
  const genreFilter = genre.length ? { "basicInfo.genre": { $in: genre } } : {};
  const tagsFilter = tags.length
    ? { "basicInfo.tags": { $in: tags.map((id) => new mongoose.Types.ObjectId(id)) } }
    : {};

  //keyword filter
  const keywordFilter = keyword && keyword.trim() !== ""
    ? {
      $or: [
        { "basicInfo.title": { $regex: keyword, $options: "i" } },
        { "basicInfo.description": { $regex: keyword, $options: "i" } },
      ],
    }
    : {};

  const combinedFilter = {
    status: "active",
    ...dateFilter,
    ...categoryFilter,
    ...genreFilter,
    ...tagsFilter,
    ...keywordFilter,
  };

  try {
    const pipeline = [
      {
        $geoNear: {
          near: { type: "Point", coordinates: [longitude, latitude] },
          key: "basicInfo.venueLocation",
          distanceField: "distance",
          spherical: true,
          maxDistance: distanceToMeters,
          query: combinedFilter,
        },
      },
      ...(distanceFrom > 0 ? [{ $match: { distance: { $gte: distanceFromMeters } } }] : []),
      {
        $lookup: {
          from: "venues",
          localField: "basicInfo.venue",
          foreignField: "_id",
          as: "venue",
          pipeline: [
            { $project: { title: 1, venueType: 1, location: 1 } },
            ...(venueTypes.length
              ? [{ $match: { venueType: { $in: venueTypes.map((id) => new mongoose.Types.ObjectId(id)) } } }]
              : []),
          ],
        },
      },
      { $unwind: "$venue" },
      {
        $lookup: {
          from: "organizations",
          let: { orgId: "$basicInfo.organization" },
          pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$orgId"] } } }, { $project: { basicInfo: 1 } }],
          as: "basicInfo.organization",
        },
      },
      { $unwind: { path: "$basicInfo.organization", preserveNullAndEmptyArrays: true } },
      // --- Sort by event start date ---
      { $sort: { "schedule.startDateTime": sort === "desc" ? -1 : 1 } },
      {
        $facet: {
          events: [{ $skip: skip }, { $limit: parseInt(limit) }],
          totalCount: [{ $count: "total" }],
        },
      },
    ];

    const result = await eventRepo.aggregateEvents(pipeline);
    const events = result[0]?.events || [];
    const totalFiltered = result[0]?.totalCount[0]?.total || 0;

    // Get favorite events
    let favoriteSet = new Set();
    if (userId && events.length > 0) {
      const eventIds = events.map((e) => e._id);
      const userFavorites = await Favorites.find({
        user: userId,
        targetType: "event",
        targetId: { $in: eventIds },
      }).select("targetId");
      favoriteSet = new Set(userFavorites.map((f) => f.targetId.toString()));
    }

    const formattedEvents = events.map((event) =>
      formatEventResponse(
        { ...event, isFavorite: favoriteSet.has(event._id.toString()) },
        { timezone }
      )
    );

    const meta = generateMeta(page, limit, totalFiltered);
    return { events: formattedEvents, meta };
  } catch (error) {
    throw new Error(`Failed to fetch nearby events: ${error.message}`);
  }
};






const getEventDetails = async (userLocation, userId, id, timezone) => {
  const event = await eventRepo.findEventById(id);
  //return if event not found
  if (!event) return null;
  const now = getCurrentDateInTimezone({ timezone });

  // TODO announcements - fetch from DB when implemented
  const announcements = {
    updates: [
      {
        "title": "Early Bird Tickets",
        "description": "This is a sample update for the event.",
        "date": "2024-10-01 10:00 AM"
      },
      {
        "title": "Entertainment",
        "description": "Live performances by top artists.",
        "date": "2024-10-05 02:00 PM"
      }
    ],
    giveaways: [],
  };

  const ticketings = await getTicketings({ timezone, eventId: id });
  // TODO 
  const loyaltyPrograms = []

  const similarEvents = await getRecommendedEvents(id, {
    page: 1,
    limit: 10,
  });


  let moreFromOrganizer = await eventRepo.getMoreFromOrganizerEvents(userId, {
    _id: { $ne: event._id },
    "basicInfo.organization": event.basicInfo?.organization,
    status: "active",
    "schedule.endDateTime": { $gte: now },
  }, 1, 10);

  moreFromOrganizer = moreFromOrganizer.map(e => formatMoreFromOrganizerEventResponse(e, { userLocation, timezone }));

  addOrUpdateRecentlyViewedItem(userId, id, 'event'); // Run in background, don't await

    const formattedEvent = formatEventResponse(event, { timezone });
    const titles =await eventRepo.getVenueTypeTitles(event.basicInfo.venue);
    const updatedEvent =attachVenueTypesToEvent(formattedEvent, titles);
  let data = {
    event: updatedEvent,

    announcements: announcements || [],
    ticketings: ticketings || [],
    loyaltyPrograms: loyaltyPrograms || [],
    similarEvents: similarEvents.data || [],
    moreFromOrganizer: moreFromOrganizer || [],
  };
  return data
};


const getEventIdByNanoid = async (nanoid) => {
  const event = await eventRepo.findEventByNanoid(nanoid);
  return event ? event._id : null;
};

// TODO when user has skipped the interests selection we will show events based on his recent activity
//get for you events for logged in user
const getForYouEvents = async (userId, location, timezone, category, time) => {
  // Fetch user preferences, interests, etc.
  const userPreferences = await getUserInterestsIdsForRecommendation(userId);

  // Get recommended events based on user preferences
  let recommendedEvents = await getForYouEventsAgainstInterests({
    location,
    timezone,
    category,
    time,
    preferences: userPreferences,
  });


  if (userId && recommendedEvents.data.length > 0) {
    const eventIds = recommendedEvents.data.map((e) => e._id);
    const userFavorites = await Favorites.find({
      user: userId,
      targetType: "event",
      targetId: { $in: eventIds },
    }).select("targetId");

    const favoriteSet = new Set(userFavorites.map((f) => f.targetId.toString()));

    recommendedEvents.data = recommendedEvents.data.map((event) => ({
      ...event,
      isFavorite: favoriteSet.has(event._id.toString()),
    }));
  }

  return recommendedEvents;
};
const getEventReservations = async (nanoid,timezone) => {
  const Reservations = await eventRepo.getEventReservations(nanoid);
console.log("Reservations",Reservations );
  return reservationsFormatterAdjustDates(Reservations, timezone)
};

const getEventsGroupedByTagsService = async ({
  location,
  radiusKm,
  timezone,
  userId,
}) => {
  const results = await eventRepo.getEventsGroupedByTagsRepo({
    location,
    radiusKm,
    timezone,
    limitPerTag: 10,
  });

  if (!Array.isArray(results)) return [];

  return results.map(group => ({
    key: "customCategory",
    title: group.title,
    data: group.data.map(event =>
      formatEventResponse(event, { timezone, userId })
    ),
  }));
};


module.exports = {
  getEventIdByNanoid,
  getNearbyEvents,
  getNearbyEventsWithAdvanceFilters,
  getEventDetails,
  getForYouEvents,
  getEventReservations,
  getEventsGroupedByTagsService,
};
