// services/eventService.js

const { getCurrentDateInTimezone, getStartAndEndOfDay, getStartAndEndOfWeek, generateMeta } = require("../../helperUtils/responseUtil");
const eventRepo = require("./eventRepository");
const _ = require("lodash");
const { getRecommendedEvents } = require("./recommendationSystem/eventsRecommender");
const { formatEventResponse } = require("../events/formatter/eventFormatter");
const { formatMoreFromOrganizerEventResponse, reservationsFormatterAdjustDates } = require("./formatter/eventFormatter");
const { attachVenueTypesToEvent } = require("./formatter/eventFormatter");
const { getUserInterestsIdsForRecommendation } = require("../usersManagement/usersRepository");
const { getForYouEventsAgainstInterests } = require("./recommendationSystem/getForYouEventsAgainstInterests");
const { Favorites } = require("../../commonModules/favorites/Favorite");
const { getTicketings } = require("../ticketing/ticketingsService");
const { default: mongoose } = require("mongoose");
const { logEngagementService } = require("@appEngagement/engagementEventsService");
const Tags = require("@TagsModel");
const { getUpdatesByEventIdService } = require("../../admin/updates/updatesService");
const { getGiveawaysByEventIdService } = require("../giveaways/GiveawayService");

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

const thisWeekEvents = async ({
  timezone,
  category,
  userLocation,
  radiusKm,
  page = 1,
  limit = 10,
  userId
}) => {

  const catObjId = category ? new mongoose.Types.ObjectId(category) : null;

  const categoryFilter = category
    ? { "basicInfo.categories": { $in: [catObjId] } }
    : {};
  const now = getCurrentDateInTimezone({ timezone });
  const skip = Math.max(0, (page - 1) * limit);
  let { start, end } = getStartAndEndOfWeek(now, timezone);
  const dateFilter = {
    "schedule.startDateTime": { $lte: end },
    "schedule.endDateTime": { $gte: now  },
  };

  const pipeline = [];

  // GEO mode
  if (userLocation) {
    const earthRadiusKm = 6378.1;
    const radiusInRadians = (parseFloat(radiusKm) || 50) / earthRadiusKm;

    pipeline.push({
      $geoNear: {
        near: userLocation,
        key: "basicInfo.venueLocation",
        distanceField: "distance",
        spherical: true,
        maxDistance: radiusInRadians * earthRadiusKm * 1000,
        query: { status: "active", ...categoryFilter, ...dateFilter },
      },
    });
  }
  // GLOBAL mode
  else {
    pipeline.push({
      $match: { status: "active", ...categoryFilter, ...dateFilter },
    });
  }

  pipeline.push(
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
  );

  // ---------- isFavorite lookup (only if logged in) ----------
  if (userId) {
    pipeline.push(
      {
        $lookup: {
          from: "favorites",
          let: { eventId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$targetId", "$$eventId"] },
                    { $eq: ["$targetType", "event"] },
                    { $eq: ["$user", new mongoose.Types.ObjectId(userId)] },
                  ],
                },
              },
            },
            { $limit: 1 },
          ],
          as: "favoriteInfo",
        },
      },
      {
        $addFields: {
          isFavorite: { $gt: [{ $size: "$favoriteInfo" }, 0] },
        },
      },
      { $project: { favoriteInfo: 0 } }
    );
  }

  pipeline.push(
    { $sort: userLocation ? { distance: 1 } : { "schedule.startDateTime": 1 } },
    { $skip: skip },
    { $limit: parseInt(limit) }
  );

  const events = await eventRepo.aggregateEvents(pipeline);

  // COUNT QUERY
  const countPipeline = userLocation
    ? [
      {
        $geoNear: {
          near: userLocation,
          key: "basicInfo.venueLocation",
          distanceField: "distance",
          spherical: true,
          query: { status: "active", ...categoryFilter, ...dateFilter },
        },
      },
      { $count: "total" },
    ]
    : [
      { $match: { status: "active", ...categoryFilter, ...dateFilter } },
      { $count: "total" },
    ];

  const totalResult = await eventRepo.aggregateEvents(countPipeline);
  const totalFiltered = totalResult[0]?.total || 0;

  const formattedEvents = events.map((event) =>
    formatEventResponse(event, { timezone })
  );

  const meta = generateMeta(page, limit, totalFiltered);

  return { data: formattedEvents, meta };
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
    sort = "asc",
  } = queryData || {};

  const {
    time,
    distanceFrom = 0,
    distanceTo = 0,
    dateFrom,
    dateTo,
    categories = [],
    venueTypes = [],
    genre = [],
    tags = [],
  } = advanceFilters;

  longitude = parseFloat(longitude);
  latitude = parseFloat(latitude);

  const distanceToMeters =
    distanceTo && Number(distanceTo) > 0 ? distanceTo * 1000 : undefined;

  const distanceFromMeters = distanceFrom * 1000;

  
  const skip = Math.max(0, (page - 1) * limit);
  const now = getCurrentDateInTimezone({ timezone });

  if (typeof longitude !== "number" || typeof latitude !== "number") {
    throw new Error("Valid user longitude and latitude are required");
  }

  // ------------------------------------
  // DATE FILTER — OPTION 2 (FULLY INSIDE RANGE)
  // ------------------------------------
  let dateFilter = {};

  if (dateFrom || dateTo) {
    const start = dateFrom
      ? new Date(`${dateFrom}T00:00:00.000Z`)
      : null;

    const end = dateTo
      ? new Date(`${dateTo}T23:59:59.999Z`)
      : null;

    if (start && end) {
      dateFilter = {
        "schedule.startDateTime": { $gte: start },
        "schedule.endDateTime": { $lte: end },
      };
    } else if (start) {
      dateFilter = {
        "schedule.startDateTime": { $gte: start },
      };
    } else if (end) {
      dateFilter = {
        "schedule.endDateTime": { $lte: end },
      };
    }
  } else if (time && time !== "all") {
    let start, end;

    switch (time) {
      case "live":
        dateFilter = {
          "schedule.startDateTime": { $lte: now },
          "schedule.endDateTime": { $gte: now },
        };
        break;

      case "today":
        ({ start, end } = getStartAndEndOfDay(now, timezone));
        dateFilter = {
          "schedule.startDateTime": { $gte: start },
          "schedule.endDateTime": { $lte: end },
        };
        break;

      case "tomorrow":
        const t = new Date(now);
        t.setDate(now.getDate() + 1);
        ({ start, end } = getStartAndEndOfDay(t, timezone));
        dateFilter = {
          "schedule.startDateTime": { $gte: start },
          "schedule.endDateTime": { $lte: end },
        };
        break;

      case "thisWeek":
        ({ start, end } = getStartAndEndOfWeek(now, timezone));
        dateFilter = {
          "schedule.startDateTime": { $gte: start },
          "schedule.endDateTime": { $lte: end },
        };
        break;

      default:
        dateFilter = { "schedule.endDateTime": { $gte: now } };
    }
  } else {
    dateFilter = { "schedule.endDateTime": { $gte: now } };
  }

  // ------------------------------------
  // CATEGORY FILTER
  // ------------------------------------
  const categoryFilter = categories.length
    ? {
        "basicInfo.categories": {
          $in: categories.map((id) => new mongoose.Types.ObjectId(id)),
        },
      }
    : {};

  // ------------------------------------
  // TAGS + GENRE (AND logic)
  // ------------------------------------
  const toObjectIds = (arr) =>
    arr
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

  const tagObjectIds = toObjectIds(genre);
  

  let tagFilter = {};

  
    if (tagObjectIds.length) {
    tagFilter = {
      "basicInfo.tags": { $all: [...tagObjectIds] },
    };
  }

  // ------------------------------------
  // KEYWORD
  // ------------------------------------
  const keywordFilter = keyword?.trim()
    ? {
        $or: [
          { "basicInfo.title": { $regex: keyword, $options: "i" } },
          { "basicInfo.description": { $regex: keyword, $options: "i" } },
        ],
      }
    : {};

  // ------------------------------------
  // FINAL COMBINED FILTER
  // ------------------------------------
  const combinedFilter = {
    status: "active",
    ...dateFilter,
    ...categoryFilter,
    ...tagFilter,
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
          ...(distanceToMeters ? { maxDistance: distanceToMeters } : {}),
          query: combinedFilter,
        },
      },

      ...(distanceFrom > 0
        ? [{ $match: { distance: { $gte: distanceFromMeters } } }]
        : []),

      {
        $lookup: {
          from: "venues",
          localField: "basicInfo.venue",
          foreignField: "_id",
          as: "venue",
          pipeline: [
            { $project: { title: 1, venueType: 1, location: 1 } },
            ...(venueTypes.length
              ? [
                  {
                    $match: {
                      venueType: {
                        $in: venueTypes.map(
                          (id) => new mongoose.Types.ObjectId(id)
                        ),
                      },
                    },
                  },
                ]
              : []),
          ],
        },
      },

      { $unwind: "$venue" },

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

      {
        $unwind: {
          path: "$basicInfo.organization",
          preserveNullAndEmptyArrays: true,
        },
      },

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
  if (!event) return null;

  // fire-and-forget engagement log
  void logEngagementService({
    entityType: "events",
    entityId: id,
    action: "view",
    userId
  }).catch(console.error);

  const now = getCurrentDateInTimezone({ timezone });

  // ---------- PARALLEL CALLS ----------
  const [
    eventUpdates,
    eventGiveAways,
    ticketings,
    similarEvents,
    moreFromOrganizerRaw
  ] = await Promise.all([
    getUpdatesByEventIdService(id),
    getGiveawaysByEventIdService(id, timezone),
    getTicketings({ timezone, eventId: id }),
    getRecommendedEvents(id, { page: 1, limit: 10 }),
    eventRepo.getMoreFromOrganizerEvents(
      userId,
      {
        _id: { $ne: event._id },
        "basicInfo.organization": event.basicInfo?.organization,
        status: "active",
        "schedule.endDateTime": { $gte: now },
      },
      1,
      10
    )
  ]);

  const announcements = {
    updates: eventUpdates || [],
    giveaways: eventGiveAways || [],
  };

  // ---------- FORMAT IN PLACE ----------
  const moreFromOrganizer = (moreFromOrganizerRaw || []).map(e =>
    formatMoreFromOrganizerEventResponse(e, { userLocation, timezone })
  );

  const formattedEvent = formatEventResponse(event, { timezone });

  // Venue lookup depends on formatted event → keep sequential
  const titles = await eventRepo.getVenueTypeTitles(
    event.basicInfo?.venue
  );

  const updatedEvent = attachVenueTypesToEvent(formattedEvent, titles);

  return {
    event: updatedEvent,
    announcements,
    ticketings: ticketings || [],
    similarEvents: similarEvents?.data || [],
    moreFromOrganizer,
  };
};



const getEventIdByNanoid = async (nanoid) => {
  const event = await eventRepo.findEventByNanoid(nanoid);
  return event ? event._id : null;
};

// TODO when user has skipped the interests selection we will show events based on his recent activity
//get for you events for logged in user
const getForYouEventsService = async ({ userId, userLocation, timezone, category, radiusKm, page = 1, limit = 20 }) => {
  // Fetch user preferences, interests, etc.
  const userPreferences = await getUserInterestsIdsForRecommendation(userId);

  // Get recommended events based on user preferences
  let recommendedEvents = await getForYouEventsAgainstInterests({
    userLocation,
    timezone,
    category,
    radiusKm,
    preferences: userPreferences,
    page,
    limit,
    userId
  });

  return recommendedEvents;
};
const getEventReservations = async (nanoid, timezone) => {
  const Reservations = await eventRepo.getEventReservations(nanoid);
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
  getForYouEventsService,
  getEventReservations,
  getEventsGroupedByTagsService,
  thisWeekEvents,
};
