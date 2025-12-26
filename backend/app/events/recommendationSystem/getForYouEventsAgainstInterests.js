const { Events } = require("../../../commonModules/events/Event");
const { generateMeta } = require("@utils/responseUtil");
const { formatRecentlyViewedEventResponse } = require("../../recentlyViewed/formatter/recentlyViewedItemsFormatter");
const { default: mongoose } = require("mongoose");

/**
 * @desc Fetch personalized "For You" events for a user based on interests
 * Prioritizes active, future, and popular events.
 */
const { getCurrentDateInTimezone} = require("../../../helperUtils/responseUtil");
const TicketingsModel = require("@TicketingsModel");
const { getMinTicketPricesByEventIds } = require("../../ticketing/ticketingsRepository");

const getForYouEventsAgainstInterests = async ({
  userLocation,
  timezone,
  category,
  radiusKm = 50,
  preferences = {},
  page = 1,
  limit = 20,
}) => {
  const now = getCurrentDateInTimezone({ timezone });
  const skip = Math.max((page - 1) * limit, 0);

  const { categories = [], tags = [], venueTypes = [] } = preferences || {};

  const catObjId = category ? new mongoose.Types.ObjectId(category) : null;

  const radiusInMeters = Math.max(radiusKm || 0, 0.1) * 1000;

  const dateFilter = {
    $or: [
      { "schedule.endDateTime": { $gte: now } },
      { "schedule.startDateTime": { $gte: now } },
    ],
  };

  const hasInterests =
    (categories?.length || tags?.length || venueTypes?.length) > 0;

  /* ---------------------------------
     BASE QUERY (shared)
  --------------------------------- */
  const baseQuery = {
    status: "active",
    ...dateFilter,
    ...(catObjId && {
      "basicInfo.categories": { $in: [catObjId] }
    })
  };

  let pipeline = [];

  /* ---------------------------------
     🌍 GLOBAL MODE (no location)
  --------------------------------- */
  if (!userLocation) {
    pipeline.push(
      { $match: baseQuery },
      { $sort: { createdAt: -1 } } // fallback ordering
    );
  }

  /* ---------------------------------
     📍 GEO MODE
  --------------------------------- */
  else {
    pipeline.push({
      $geoNear: {
        near: userLocation,
        key: "basicInfo.venueLocation",
        distanceField: "distance",
        spherical: true,
        maxDistance: radiusInMeters,
        query: baseQuery
      }
    });
  }

  /* ---------------------------------
     INTEREST SCORING
  --------------------------------- */
  if (hasInterests) {
    pipeline.push(
      {
        $addFields: {
          matchedTags: {
            $setIntersection: [{ $ifNull: ["$basicInfo.tags", []] }, tags],
          },
          matchedCategories: {
            $setIntersection: [
              { $ifNull: ["$basicInfo.categories", []] },
              categories,
            ],
          },
          matchedVenueTypes: {
            $cond: [
              { $gt: [venueTypes.length, 0] },
              {
                $setIntersection: [
                  { $ifNull: ["$basicInfo.venueType", []] },
                  venueTypes,
                ],
              },
              [],
            ],
          },
        },
      },
      {
        $addFields: {
          matchScore: {
            $add: [
              { $multiply: [{ $size: "$matchedTags" }, 1.0] },
              { $multiply: [{ $size: "$matchedCategories" }, 1.2] },
              { $multiply: [{ $size: "$matchedVenueTypes" }, 1.0] },
              { $divide: [{ $ifNull: ["$meta.viewsCount", 0] }, 100] },
              { $divide: [{ $ifNull: ["$meta.favoritesCount", 0] }, 50] },
            ],
          },
        },
      },
      { $match: { matchScore: { $gt: 0 } } },
      { $sort: { matchScore: -1, "meta.viewsCount": -1, createdAt: -1 } }
    );
  } else {
    pipeline.push(
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
      { $sort: { trendingScore: -1, createdAt: -1 } }
    );
  }

  /* ---------------------------------
     PAGINATION + LOOKUPS
  --------------------------------- */
  pipeline.push(
    { $skip: skip },
    { $limit: limit },
    ...getEventLookups()
  );

  const results = await Events.aggregate(pipeline).allowDiskUse(true);

  // 🎟 Ticket prices
  const eventIds = results.map(ev => ev._id);
  const ticketPriceMap = await getMinTicketPricesByEventIds(eventIds);

  const formatted = results.map(event => {
    const formattedEvent = formatRecentlyViewedEventResponse(event, {
      userLocation,
      timezone,
    });

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
