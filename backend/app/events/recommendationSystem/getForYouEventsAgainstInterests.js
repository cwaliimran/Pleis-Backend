const { Events } = require("../../../commonModules/events/Event");
const { generateMeta } = require("@utils/responseUtil");
const { formatRecentlyViewedEventResponse } = require("../../recentlyViewed/formatter/recentlyViewedItemsFormatter");
const { default: mongoose } = require("mongoose");

/**
 * @desc Fetch personalized "For You" events for a user based on interests
 * Prioritizes active, future, and popular events.
 */
const { getCurrentDateInTimezone, getStartAndEndOfDay, getStartAndEndOfWeek } = require("../../../helperUtils/responseUtil");
const TicketingsModel = require("@TicketingsModel");
const { getMinTicketPricesByEventIds } = require("../../ticketing/ticketingsRepository");

const getForYouEventsAgainstInterests = async ({
  location,
  timezone,
  category,
  time,
  preferences = {},
  page = 1,
  limit = 20,
}) => {
  const now = getCurrentDateInTimezone({ timezone });
  const skip = Math.max((page - 1) * limit, 0);

  const { categories = [], tags = [], venueTypes = [] } = preferences || {};

  // Single category filter (from query param)
  const catObjId = category ? new mongoose.Types.ObjectId(category) : null;
  const categoryFilter = category
    ? { "basicInfo.categories": { $in: [catObjId] } }
    : {};

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
    // Default: upcoming events
    dateFilter = {
      $or: [
        { "schedule.endDateTime": { $gte: now } },
        { "schedule.startDateTime": { $gte: now } },
      ],
    };
  }

  // Base match including category + date filters
  const baseMatch = {
    status: "active",
    ...categoryFilter,
  };

  const hasInterests =
    (categories?.length || tags?.length || venueTypes?.length) > 0;

  let pipeline = [];

  if (hasInterests) {
    pipeline = [
      { $match: { ...baseMatch, ...dateFilter } },
      {
        $addFields: {
          matchedTags: {
            $setIntersection: [{ $ifNull: ["$basicInfo.tags", []] }, tags || []],
          },
          matchedCategories: {
            $setIntersection: [{ $ifNull: ["$basicInfo.categories", []] }, categories || []],
          },
          matchedVenueTypes: {
            $cond: [
              { $gt: [venueTypes.length, 0] },
              { $setIntersection: [{ $ifNull: ["$basicInfo.venueType", []] }, venueTypes] },
              [],
            ],
          },
        },
      },
      {
        $addFields: {
          matchScore: {
            $add: [
              { $multiply: [{ $size: { $ifNull: ["$matchedTags", []] } }, 1.0] },
              { $multiply: [{ $size: { $ifNull: ["$matchedCategories", []] } }, 1.2] },
              { $multiply: [{ $size: { $ifNull: ["$matchedVenueTypes", []] } }, 1.0] },
              { $divide: [{ $ifNull: ["$meta.viewsCount", 0] }, 100] },
              { $divide: [{ $ifNull: ["$meta.favoritesCount", 0] }, 50] },
            ],
          },
        },
      },
      { $match: { matchScore: { $gt: 0 } } },
      { $sort: { matchScore: -1, "meta.viewsCount": -1, createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      ...getEventLookups(),
    ];
  } else {
    pipeline = [
      { $match: { ...baseMatch, ...dateFilter } },
      {
        $addFields: {
          trendingScore: {
            $add: [
              { $multiply: [{ $ifNull: ["$meta.viewsCount", 0] }, 0.5] },
              { $multiply: [{ $ifNull: ["$meta.favoritesCount", 0] }, 1.5] },
              { $multiply: [{ $ifNull: ["$meta.attendeesCount", 0] }, 1.0] },
            ],
          },
        },
      },
      { $sort: { trendingScore: -1, createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      ...getEventLookups(),
    ];
  }

 let results = [];
try {
  results = await Events.aggregate(pipeline).allowDiskUse(true);
} catch (err) {
  console.error("❌ [getForYouEventsAgainstInterests] Aggregation failed:", err);
  throw new Error("Failed to fetch personalized events");
}

if (!Array.isArray(results)) results = [];

// --------------------------------------------------
// 🎟️ BATCH FETCH MIN TICKET PRICE PER EVENT
// --------------------------------------------------
const eventIds = results.map(ev => ev._id);
const ticketPriceMap = await getMinTicketPricesByEventIds(eventIds);
  if (!Array.isArray(results)) results = [];

const formatted = results.map((event) => {
  const formattedEvent = formatRecentlyViewedEventResponse(event, {
    userLocation: location,
    timezone,
  });

  //attach the minimum ticket price (start price) to each event
  const minPrice = ticketPriceMap[event._id.toString()] || null;

  formattedEvent.ticketInfo = minPrice
    ? { price: `€${minPrice}` }
    : null;

  return formattedEvent;
});


  const meta = generateMeta(page, limit, formatted.length);

  return { data: formatted, meta };
};

/**
 * Helper: shared $lookups for enrichment
 */
function getEventLookups() {
  return [
    {
      $lookup: {
        from: "categories",
        localField: "basicInfo.categories",
        foreignField: "_id",
        as: "basicInfo.categories",
        pipeline: [{ $project: { _id: 1, title: 1, image: 1 } }],
      },
    },
    {
      $lookup: {
        from: "tags",
        localField: "basicInfo.tags",
        foreignField: "_id",
        as: "basicInfo.tags",
        pipeline: [{ $project: { _id: 1, title: 1 } }],
      },
    },
    {
      $lookup: {
        from: "organizations",
        localField: "basicInfo.organization",
        foreignField: "_id",
        as: "basicInfo.organization",
        pipeline: [
          { $project: { _id: 1, "basicInfo.name": 1, "basicInfo.media": 1 } },
        ],
      },
    },
    {
      $unwind: {
        path: "$basicInfo.organization",
        preserveNullAndEmptyArrays: true,
      },
    },
  ];
}

module.exports = { getForYouEventsAgainstInterests };
