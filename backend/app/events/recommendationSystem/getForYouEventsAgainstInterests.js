const { Events } = require("../../../commonModules/events/Event");
const { generateMeta } = require("@utils/responseUtil");
const { formatRecentlyViewedEventResponse } = require("../../recentlyViewed/formatter/recentlyViewedItemsFormatter");
const { default: mongoose } = require("mongoose");
const { getCurrentDateInTimezone } = require("../../../helperUtils/responseUtil");
const { getMinTicketPricesByEventIds } = require("../../ticketing/ticketingsRepository");

const toObjectIdArray = (val) => {
  if (!val) return [];

  const arr = Array.isArray(val) ? val : [val];

  return arr
    .filter(Boolean)
    .map(id => {
      try {
        return new mongoose.Types.ObjectId(id);
      } catch (e) {
        return null;
      }
    })
    .filter(Boolean);
};
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
  userId,
  ctx
}) => {
  const now = getCurrentDateInTimezone({ timezone });
  const skip = Math.max((page - 1) * limit, 0);

  const advanceFilters = ctx?.advanceFilters || {};

  const ctxCategories = (advanceFilters.categories || []).map(id => new mongoose.Types.ObjectId(id));
  const ctxTags = (advanceFilters.tags || []).map(id => new mongoose.Types.ObjectId(id));
  const ctxVenueTypes = (advanceFilters.venueTypes || []).map(id => new mongoose.Types.ObjectId(id));

  const prefCategories = (preferences.categories || []).map(id => new mongoose.Types.ObjectId(id));
  const prefTags = (preferences.tags || []).map(id => new mongoose.Types.ObjectId(id));
  const prefVenueTypes = (preferences.venueTypes || []).map(id => new mongoose.Types.ObjectId(id));

  const categoryObjectIds = toObjectIdArray(category);
  const radiusInMeters = radiusKm * 1000;

  const baseQuery = {
    status: "active",
    $or: [
      { "schedule.endDateTime": { $gte: now } },
      { "schedule.startDateTime": { $gte: now } }
    ],

  };
  if (categoryObjectIds.length) {
    baseQuery["basicInfo.categories"] = {
      $in: categoryObjectIds
    };
  }

  /* ===============================
     CTX FILTER MERGE (STRICT)
     =============================== */
  if (ctx) {
    if (ctxCategories.length) baseQuery["basicInfo.categories"] = { $in: ctxCategories };
    if (ctxTags.length) baseQuery["basicInfo.tags"] = { $in: ctxTags };
  }

  let pipeline = [];

  if (userLocation) {
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
  } else {
    pipeline.push({ $match: baseQuery });
  }

  /* ===============================
     ENGAGEMENT
     =============================== */
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
                  as: "v",
                  in: "$$v.count"
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
                  as: "v",
                  in: "$$v.count"
                }
              }
            },
            0
          ]
        }
      }
    }
  );

  /* ===============================
     INTEREST SCORE (CTX + PREFS MERGED)
     =============================== */
  const categories = ctxCategories.length ? ctxCategories : prefCategories;
  const tags = ctxTags.length ? ctxTags : prefTags;
  const venueTypes = ctxVenueTypes.length ? ctxVenueTypes : prefVenueTypes;

  pipeline.push({
    $addFields: {
      matchScore: {
        $add: [
          {
            $multiply: [
              { $size: { $setIntersection: [{ $ifNull: ["$basicInfo.categories", []] }, categories] } },
              1.2
            ]
          },
          {
            $multiply: [
              { $size: { $setIntersection: [{ $ifNull: ["$basicInfo.tags", []] }, tags] } },
              1.0
            ]
          },
          {
            $multiply: [
              { $size: { $setIntersection: [{ $ifNull: ["$basicInfo.venueType", []] }, venueTypes] } },
              1.0
            ]
          },
          { $divide: ["$viewsCount", 100] },
          { $divide: ["$favoritesCount", 50] }
        ]
      }
    }
  });

  /* ===============================
     SORT BASED ON SCORE
     =============================== */
  pipeline.push({ $sort: { matchScore: -1, createdAt: -1 } });

  /* ===============================
     PAGINATION WITH COUNT (IMPORTANT FIX)
     =============================== */
  const facetPipeline = [
    {
      $facet: {
        data: [
          { $skip: skip },
          { $limit: limit },

          ...getEventLookups()
        ],

        totalCount: [
          { $count: "count" }
        ]
      }
    }
  ];

  pipeline.push(...facetPipeline);

  const result = await Events.aggregate(pipeline).allowDiskUse(true);

  const data = result[0]?.data || [];
  const totalCount = result[0]?.totalCount?.[0]?.count || 0;

  return {
    recommendedEvents: data,
    totalCount
  };
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
