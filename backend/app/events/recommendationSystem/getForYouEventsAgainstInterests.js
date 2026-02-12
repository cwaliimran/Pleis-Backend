const { Events } = require("../../../commonModules/events/Event");
const { generateMeta } = require("@utils/responseUtil");
const { formatRecentlyViewedEventResponse } = require("../../recentlyViewed/formatter/recentlyViewedItemsFormatter");
const { default: mongoose } = require("mongoose");
const { getCurrentDateInTimezone } = require("../../../helperUtils/responseUtil");
const { getMinTicketPricesByEventIds } = require("../../ticketing/ticketingsRepository");

/**
 * Personalized "For You" events based on interests + engagement signals
 */
const getForYouEventsAgainstInterests = async ({
  userLocation,
  timezone,
  category,
  radiusKm = 50,
  preferences = {},
  page = 1,
  limit = 20,
  userId
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

  const baseQuery = {
    status: "active",
    ...dateFilter,
    ...(catObjId && {
      "basicInfo.categories": { $in: [catObjId] }
    })
  };

  let pipeline = [];

  /* ---------------- Base geo or normal match ---------------- */
  if (!userLocation) {
    pipeline.push(
      { $match: baseQuery },
      { $sort: { createdAt: -1 } }
    );
  } else {
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

  /* ---------------- Engagement stats lookup ---------------- */
  pipeline.push(
    {
      $lookup: {
        from: "engagementevents",
        let: { eventId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$entityId", "$$eventId"] },
                  { $eq: ["$entityType", "events"] }
                ]
              }
            }
          },
          {
            $group: {
              _id: "$action",
              count: { $sum: 1 }
            }
          }
        ],
        as: "engagementStats"
      }
    },
    {
      $addFields: {
        viewsCount: {
          $ifNull: [
            {
              $first: {
                $map: {
                  input: {
                    $filter: {
                      input: "$engagementStats",
                      as: "s",
                      cond: { $eq: ["$$s._id", "view"] }
                    }
                  },
                  as: "f",
                  in: "$$f.count"
                }
              }
            },
            0
          ]
        },
        favoritesCount: {
          $ifNull: [
            {
              $first: {
                $map: {
                  input: {
                    $filter: {
                      input: "$engagementStats",
                      as: "s",
                      cond: { $eq: ["$$s._id", "favorite"] }
                    }
                  },
                  as: "f",
                  in: "$$f.count"
                }
              }
            },
            0
          ]
        }
      }
    }
  );

  /* ---------------- Interest scoring ---------------- */
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
              { $divide: ["$viewsCount", 100] },
              { $divide: ["$favoritesCount", 50] },
            ],
          },
        },
      },
      { $match: { matchScore: { $gt: 0 } } },
      { $sort: { matchScore: -1, viewsCount: -1, createdAt: -1 } }
    );
  } else {
    /* ---------------- Trending fallback ---------------- */
    pipeline.push(
      {
        $addFields: {
          trendingScore: {
            $add: [
              { $multiply: ["$viewsCount", 0.5] },
              { $multiply: ["$favoritesCount", 1.5] },
              { $multiply: [{ $ifNull: ["$meta.attendeesCount", 0] }, 1.0] },
            ],
          },
        },
      },
      { $sort: { trendingScore: -1, createdAt: -1 } }
    );
  }

  /* ---------------- Favorite flag ---------------- */
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
                    { $eq: ["$user", new mongoose.Types.ObjectId(userId)] }
                  ]
                }
              }
            },
            { $limit: 1 }
          ],
          as: "favoriteInfo"
        }
      },
      {
        $addFields: {
          isFavorite: { $gt: [{ $size: "$favoriteInfo" }, 0] }
        }
      },
      { $project: { favoriteInfo: 0 } }
    );
  }

  pipeline.push(
    { $skip: skip },
    { $limit: limit },
    ...getEventLookups()
  );

  const results = await Events.aggregate(pipeline).allowDiskUse(true);

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

/* ---------- Shared lookups ---------- */
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
