// services/eventService.js

const { getCurrentDateInTimezone, getStartAndEndOfDay, getStartAndEndOfWeek, generateMeta } = require("../../helperUtils/responseUtil");
const eventRepo = require("./eventRepository");
const _ = require("lodash");
const { getRecommendedEvents } = require("./recommendationSystem/eventsRecommender");
const { formatEventResponse } = require("../events/formatter/eventFormatter");
const { formatMoreFromOrganizerEventResponse } = require("./formatter/eventFormatter");
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
    page = 1,
    limit = 10,
    timezone = "Asia/Karachi",
    radiusKm = 0,
    advanceFilters = {},
  } = queryData || {};

  const {
    time,
    dateFrom,
    dateTo,
    categories = [],
    venueTypes = [],
    genre = [],
    vibe = [],
  } = advanceFilters;

  longitude = parseFloat(longitude);
  latitude = parseFloat(latitude);
  radiusKm = !radiusKm || radiusKm === "" ? 20037.5 : parseFloat(radiusKm);
  const radiusInMeters = radiusKm * 1000;
  const skip = Math.max(0, (page - 1) * limit);
  const now = getCurrentDateInTimezone({ timezone });

  if (typeof longitude !== "number" || typeof latitude !== "number") {
    throw new Error("Valid user longitude and latitude are required");
  }
  if (radiusKm <= 0) {
    throw new Error("Radius must be greater than 0");
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

  // --- Categories / Genre / Vibe filter ---
  const categoryFilter = categories.length
    ? { "basicInfo.categories": { $in: categories.map((id) => new mongoose.Types.ObjectId(id)) } }
    : {};
  const genreFilter = genre.length ? { "basicInfo.genre": { $in: genre } } : {};
  const vibeFilter = vibe.length ? { "basicInfo.vibe": { $in: vibe } } : {};

  const combinedFilter = {
    status: "active",
    ...dateFilter,
    ...categoryFilter,
    ...genreFilter,
    ...vibeFilter,
  };

  try {
    const pipeline = [
      {
        $geoNear: {
          near: { type: "Point", coordinates: [longitude, latitude] },
          key: "basicInfo.venueLocation",
          distanceField: "distance",
          spherical: true,
          maxDistance: radiusInMeters,
          query: combinedFilter,
        },
      },
      // Lookup venues to filter by venueType
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
      { $project: { schedule: 1, basicInfo: 1, distance: 1, venue: 1 } },
      {
        $lookup: {
          from: "organizations",
          let: { orgId: "$basicInfo.organization" },
          pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$orgId"] } } }, { $project: { basicInfo: 1 } }],
          as: "basicInfo.organization",
        },
      },
      { $unwind: { path: "$basicInfo.organization", preserveNullAndEmptyArrays: true } },
      { $sort: { distance: 1 } },
      { $skip: skip },
      { $limit: parseInt(limit) },
    ];

    const events = await eventRepo.aggregateEvents(pipeline);

    // Count total
    const totalCountPipeline = [
      {
        $geoNear: {
          near: { type: "Point", coordinates: [longitude, latitude] },
          key: "basicInfo.venueLocation",
          distanceField: "distance",
          spherical: true,
          maxDistance: radiusInMeters,
          query: combinedFilter,
        },
      },
      {
        $lookup: {
          from: "venues",
          localField: "basicInfo.venue",
          foreignField: "_id",
          as: "venue",
          pipeline: [
            ...(venueTypes.length
              ? [{ $match: { venueType: { $in: venueTypes.map((id) => new mongoose.Types.ObjectId(id)) } } }]
              : []),
          ],
        },
      },
      { $unwind: "$venue" },
      { $count: "total" },
    ];

    const totalResult = await eventRepo.aggregateEvents(totalCountPipeline);
    const totalFiltered = totalResult[0]?.total || 0;

    const formattedEvents = events.map((event) => formatEventResponse(event, { timezone }));

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


  let data = {
    event: formatEventResponse(event, { timezone }),
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

  //TODO check if recommended events are less than limit, then fill with trending events

  //check if events are isFavorite by user

  // Add "favorite" flag
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

module.exports = {
  getEventIdByNanoid,
  getNearbyEvents,
  getNearbyEventsWithAdvanceFilters,
  getEventDetails,
  getForYouEvents
};
