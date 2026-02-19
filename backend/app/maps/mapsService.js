
const Organizations = require("../../commonModules/organizations/Organization");
const mapsRepo = require("./mapsRepository");
const moment = require("moment-timezone");
const mongoose = require("mongoose");
const { Events } = require("../../commonModules/events/Event");
const { transformOperatingHoursToLocal, isOrganizationOpenNow, getUtcMinutesAndLocalWeekdayKey } = require("../../shared/commonSchemas/operatingHours");
const { formatOrganization } = require("../../commonModules/organizations/formatter/formatOrganization");
const { formatEventResponse } = require("../events/formatter/eventFormatter");
const { Favorites } = require("../../commonModules/favorites/Favorite");
const { getCurrentDateInTimezone, getStartAndEndOfDay, getStartAndEndOfWeek, generateMeta } = require("../../helperUtils/responseUtil");
const Tags = require("@TagsModel");


const getEvents = async (queryData) => {
  let {
    keyword = "",
    page = 1,
    limit = 10,
    timezone = "Asia/Karachi",
    advanceFilters = {},
    userId,
    sort = "asc",
    bounds = null,
  } = queryData || {};


  const {
    time,
    dateFrom,
    dateTo,
    categories = [],
    venueTypes = [],
    genre = [],
    tags = [],
  } = advanceFilters;

  const skip = Math.max(0, (page - 1) * limit);
  const now = getCurrentDateInTimezone({ timezone });

  // ---------------------------------
  // TIME RANGE FILTER
  // ---------------------------------
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
        dateFilter = {
          "schedule.startDateTime": { $lte: now },
          "schedule.endDateTime": { $gte: now },
        };
        break;

      case "today":
        ({ start, end } = getStartAndEndOfDay(now, timezone));
        dateFilter = {
          "schedule.startDateTime": { $lte: end },
          "schedule.endDateTime": { $gte: start },
        };
        break;

      case "tomorrow":
        const t = new Date(now);
        t.setDate(now.getDate() + 1);
        ({ start, end } = getStartAndEndOfDay(t, timezone));
        dateFilter = {
          "schedule.startDateTime": { $lte: end },
          "schedule.endDateTime": { $gte: start },
        };
        break;

      case "thisWeek":
        ({ start, end } = getStartAndEndOfWeek(now, timezone));
        dateFilter = {
          "schedule.startDateTime": { $lte: end },
          "schedule.endDateTime": { $gte: start },
        };
        break;

      default:
        dateFilter = { "schedule.endDateTime": { $gte: now } };
    }
  } else {
    dateFilter = { "schedule.endDateTime": { $gte: now } };
  }

  // ---------------------------------
  // CATEGORY FILTER
  // ---------------------------------
  const categoryFilter = categories.length
    ? {
      "basicInfo.categories": {
        $in: categories.map((id) => new mongoose.Types.ObjectId(id)),
      },
    }
    : {};

  // ---------------------------------
  // TAG + GENRE (AND logic)
  // ---------------------------------
  const toObjectIds = (arr) =>
    arr
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

  const tagObjectIds = toObjectIds(tags);
  let genreTagIds = [];

  if (genre.length) {
    const genreTags = await Tags.find({
      status: "active",
      type: { $in: genre },
    }).select("_id");

    genreTagIds = genreTags.map((t) => t._id);
  }

  let tagFilter = {};

  if (genre.length && genreTagIds.length === 0) {
    tagFilter = { "basicInfo.tags": { $in: [] } };
  } else if (tagObjectIds.length || genreTagIds.length) {
    tagFilter = {
      "basicInfo.tags": {
        $all: [...tagObjectIds, ...genreTagIds],
      },
    };
  }

  // ---------------------------------
  // KEYWORD FILTER
  // ---------------------------------
  const keywordFilter =
    keyword?.trim()
      ? {
        $or: [
          { "basicInfo.title": { $regex: keyword, $options: "i" } },
          { "basicInfo.description": { $regex: keyword, $options: "i" } },
        ],
      }
      : {};

  // ---------------------------------
  // BOUNDS FILTER
  // ---------------------------------
  let boundsFilter = {};

  if (bounds?.northEast && bounds?.southWest) {
    const { northEast, southWest } = bounds;

    boundsFilter = {
      "basicInfo.venueLocation": {
        $geoWithin: {
          $box: [
            [southWest.longitude, southWest.latitude],
            [northEast.longitude, northEast.latitude],
          ],
        },
      },
    };
  }

  // ---------------------------------
  // FINAL MATCH (BEFORE VENUE LOOKUP)
  // ---------------------------------
  const combinedFilter = {
    status: "active",
    ...dateFilter,
    ...categoryFilter,
    ...tagFilter,
    ...keywordFilter,
    ...boundsFilter,
  };

  //
  // VENUE TYPE FILTER OBJECT IDs
  //
  const venueTypeObjIds = venueTypes
    .filter(mongoose.Types.ObjectId.isValid)
    .map(id => new mongoose.Types.ObjectId(id));

  try {
    const pipeline = [
      { $match: combinedFilter },

      //
      // LOOKUP VENUE (NO FILTER HERE ANYMORE)
      //
      {
        $lookup: {
          from: "venues",
          localField: "basicInfo.venue",
          foreignField: "_id",
          as: "venue",
          pipeline: [
            { $project: { title: 1, venueType: 1, location: 1 } },
          ],
        },
      },

      { $unwind: "$venue" },

      //
      // APPLY VENUE TYPE FILTER HERE
      //
      ...(venueTypeObjIds.length
        ? [
          {
            $match: {
              "venue.venueType": { $in: venueTypeObjIds },
            },
          },
        ]
        : []),

      //
      // ORGANIZATION
      //
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

      //lookup tags
      {
        $lookup: {
          from: "tags",
          localField: "basicInfo.tags",
          foreignField: "_id",
          as: "basicInfo.tags",
          pipeline: [
            { $project: { title: 1 } },
          ],
        },
      },

      { $sort: { "schedule.startDateTime": sort === "desc" ? -1 : 1 } },

      //
      // CORRECT FACET — COUNTS AFTER ALL FILTERS
      //
      {
        $facet: {
          events: [
            { $skip: skip },
            { $limit: parseInt(limit) },
          ],
          totalCount: [
            { $count: "total" },
          ],
        },
      },
    ];

    const result = await mapsRepo.aggregateEvents(pipeline);

    const events = result?.[0]?.events || [];
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

    const meta = generateMeta(
      page,
      limit,
      result?.[0]?.totalCount?.[0]?.total || 0
    );

    return {
      status: true,
      result: { data: formattedEvents, meta },
    };

  } catch (error) {
    throw new Error(`Failed to fetch events: ${error.message}`);
  }
};



const getPlaces = async (queryData = {}) => {
  try {
    const {
      page = 1,
      limit = 10,
      keyword = "",
      sort = "asc",
      timezone = "Asia/Karachi",
      userId = null,
      bounds = null,
      advanceFilters = {}
    } = queryData;

    //TODO topRated, trending
    const {
      time, // openNow, topRated, trending
      categories = [],
      venueTypes = [],
      tags = [],
      genre = [],
      distanceFrom = 0,
      distanceTo = 0,
    } = advanceFilters;

    const skip = (page - 1) * limit;

    let sortStage = { createdAt: sort === "asc" ? 1 : -1 };
    if (time === "topRated") {
      sortStage = {
        avgRating: -1,
        totalReviews: -1,
        createdAt: -1,
      };
    } else if (time === "trending") {
      sortStage = {
        trendingScore: -1, // future field
        createdAt: -1,
      };
    }


    //
    // BASE MATCH
    //
    const matchFilter = { status: "active" };

    //
    // KEYWORD
    //
    if (keyword) {
      matchFilter["basicInfo.name"] = { $regex: keyword, $options: "i" };
    }

    //
    // CATEGORY FILTER
    //
    const categoryObjIds = categories
      .filter(mongoose.Types.ObjectId.isValid)
      .map(id => new mongoose.Types.ObjectId(id));

    if (categoryObjIds.length) {
      matchFilter["otherInfo.categories"] = { $in: categoryObjIds };
    }

    //
    // TAG FILTER
    //
    const tagObjIds = tags
      .filter(mongoose.Types.ObjectId.isValid)
      .map(id => new mongoose.Types.ObjectId(id));

    if (tagObjIds.length) {
      matchFilter["otherInfo.tags.id"] = { $in: tagObjIds };
    }

    //
    // GENRE FILTER
    //
    if (genre.length) {
      const genreTags = await Tags.find({
        status: "active",
        type: { $in: genre }
      }).select("_id");

      const genreTagIds = genreTags.map(t => t._id);

      matchFilter["otherInfo.tags.id"] = {
        $in: genreTagIds.length ? genreTagIds : []
      };
    }

    //
    // BOUNDS FILTER
    //
    let boundsFilter = {};

    if (
      bounds?.northEast &&
      bounds?.southWest
    ) {
      boundsFilter = {
        location: {
          $geoWithin: {
            $box: [
              [bounds.southWest.longitude, bounds.southWest.latitude],
              [bounds.northEast.longitude, bounds.northEast.latitude],
            ]
          }
        }
      };
    }

    const finalMatch = {
      ...matchFilter,
      ...boundsFilter
    };

    //
    // CONVERT venueTypes → ObjectIds
    //
    const venueTypeObjIds = venueTypes
      .filter(mongoose.Types.ObjectId.isValid)
      .map(id => new mongoose.Types.ObjectId(id));

    let utcMinutes = null;
    let localWeekdayKey = null;

    if (time === "openNow") {
      ({ utcMinutes, localWeekdayKey } =
        getUtcMinutesAndLocalWeekdayKey(timezone));
    }

    const openNowStages =
      time === "openNow"
        ? [
          {
            $addFields: {
              todayHours: {
                $getField: {
                  field: localWeekdayKey,
                  input: "$operatingHours"
                }
              }
            }
          },
          {
            $addFields: {
              isOpenNow: {
                $let: {
                  vars: {
                    from: "$todayHours.from",
                    to: "$todayHours.to",
                    isOpen: "$todayHours.isOpen",
                    breakFrom: "$todayHours.break.from",
                    breakTo: "$todayHours.break.to",
                    now: utcMinutes
                  },
                  in: {
                    $cond: [
                      {
                        $and: [
                          { $eq: ["$$isOpen", true] },
                          { $ne: ["$$from", null] },
                          { $ne: ["$$to", null] }
                        ]
                      },
                      {
                        $let: {
                          vars: {
                            inRange: {
                              $cond: [
                                { $lte: ["$$from", "$$to"] },
                                {
                                  $and: [
                                    { $gte: ["$$now", "$$from"] },
                                    { $lte: ["$$now", "$$to"] }
                                  ]
                                },
                                {
                                  $or: [
                                    { $gte: ["$$now", "$$from"] },
                                    { $lte: ["$$now", "$$to"] }
                                  ]
                                }
                              ]
                            },
                            inBreak: {
                              $and: [
                                { $ne: ["$$breakFrom", null] },
                                { $ne: ["$$breakTo", null] },
                                { $gte: ["$$now", "$$breakFrom"] },
                                { $lte: ["$$now", "$$breakTo"] }
                              ]
                            }
                          },
                          in: {
                            $and: [
                              "$$inRange",
                              { $not: ["$$inBreak"] }
                            ]
                          }
                        }
                      },
                      false
                    ]
                  }
                }
              }
            }
          },
          { $project: { todayHours: 0 } },
          { $match: { isOpenNow: true } }
        ]
        : [];


    /* ===============================
   ⭐ ratingStages HERE
=============================== */
    const ratingStages =
      time === "topRated"
        ? [
          {
            $lookup: {
              from: "reviews",
              let: { orgId: "$_id" },
              pipeline: [
                {
                  $match: {
                    $expr: { $eq: ["$organization", "$$orgId"] },
                    status: "active"
                  }
                },
                {
                  $group: {
                    _id: null,
                    avgRating: { $avg: "$rating" },
                    totalReviews: { $sum: 1 }
                  }
                }
              ],
              as: "ratingStats"
            }
          },
          {
            $addFields: {
              avgRating: {
                $ifNull: [{ $arrayElemAt: ["$ratingStats.avgRating", 0] }, 0]
              },
              totalReviews: {
                $ifNull: [{ $arrayElemAt: ["$ratingStats.totalReviews", 0] }, 0]
              }
            }
          },

          // ⭐ FILTER TOP RATED
          {
            $match: {
              avgRating: { $gte: 4.5 }
            }
          },

          { $project: { ratingStats: 0 } }
        ]
        : [];


    /* ===============================
 🔥 trendingStages
=============================== */
    const now = Date.now();
    const last48h = new Date(now - 48 * 60 * 60 * 1000);
    const last7d = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const trendingStages =
      time === "trending"
        ? [
          {
            $lookup: {
              from: "engagementevents",
              let: { orgId: "$_id" },
              pipeline: [
                {
                  $match: {
                    entityType: "organizations",
                    action: "view",
                    $expr: { $eq: ["$entityId", "$$orgId"] },
                    createdAt: { $gte: last7d }
                  }
                },
                {
                  $group: {
                    _id: null,
                    views7d: { $sum: 1 },
                    views48h: {
                      $sum: {
                        $cond: [{ $gte: ["$createdAt", last48h] }, 1, 0]
                      }
                    }
                  }
                }
              ],
              as: "engagementStats"
            }
          },
          {
            $addFields: {
              views7d: { $ifNull: [{ $first: "$engagementStats.views7d" }, 0] },
              views48h: { $ifNull: [{ $first: "$engagementStats.views48h" }, 0] }
            }
          },
          {
            $addFields: {
              trendingScore: {
                $round: [
                  {
                    $add: [
                      { $multiply: [0.3, "$views48h"] },
                      { $multiply: [0.7, "$views7d"] }
                    ]
                  },
                  2
                ]
              }
            }
          },

          // ⭐ FILTER TRENDING
          {
            $match: {
              trendingScore: { $gt: 0 }
            }
          },

          { $project: { engagementStats: 0 } }
        ]
        : [];



    //
    // PIPELINE
    //
    const pipeline = [
      { $match: finalMatch },
      ...openNowStages,

      //
      // JOIN VENUES
      //
      {
        $lookup: {
          from: "venues",
          localField: "_id",
          foreignField: "organization",
          pipeline: [
            { $project: { _id: 1, venueType: 1 } }
          ],
          as: "linkedVenues"
        }
      },

      //
      // APPLY VENUE TYPE FILTER (NOW CORRECT)
      //
      ...(
        venueTypeObjIds.length
          ? [{
            $match: {
              $expr: {
                $gt: [
                  {
                    $size: {
                      $filter: {
                        input: "$linkedVenues",
                        as: "v",
                        cond: {
                          $or: [
                            { $eq: ["$$v.venueType", { $arrayElemAt: [venueTypeObjIds, 0] }] },
                            { $in: ["$$v.venueType", venueTypeObjIds] }
                          ]
                        }
                      }
                    }
                  },
                  0
                ]
              }
            }
          }]
          : []
      ),

      //
      // POPULATE CATEGORIES
      //
      {
        $lookup: {
          from: "categories",
          localField: "otherInfo.categories",
          foreignField: "_id",
          pipeline: [
            { $project: { _id: 1, title: 1, image: 1 } }
          ],
          as: "populatedCategories"
        }
      },

      //
      // POPULATE TAGS
      //
      {
        $lookup: {
          from: "tags",
          localField: "otherInfo.tags.id",
          foreignField: "_id",
          pipeline: [
            { $project: { _id: 1, title: 1, type: 1 } }
          ],
          as: "populatedTags"
        }
      },

      {
        $addFields: {
          "otherInfo.categories": "$populatedCategories",
          "otherInfo.tags": "$populatedTags"
        }
      },

      { $project: { populatedCategories: 0, populatedTags: 0 } },
      ...(time === "topRated" ? ratingStages : []),
      ...(time === "trending" ? trendingStages : []),

      { $sort: sortStage },
      { $skip: skip },
      { $limit: limit }
    ];

    const items = await Organizations.aggregate(pipeline);

    //
    // COUNT
    //
    const countPipeline = [
      { $match: finalMatch },
      ...openNowStages,
      {
        $lookup: {
          from: "venues",
          localField: "_id",
          foreignField: "organization",
          pipeline: [
            { $project: { _id: 1, venueType: 1 } }
          ],
          as: "linkedVenues"
        }
      },

      ...(
        venueTypeObjIds.length
          ? [{
            $match: {
              $expr: {
                $gt: [
                  {
                    $size: {
                      $filter: {
                        input: "$linkedVenues",
                        as: "v",
                        cond: {
                          $or: [
                            { $eq: ["$$v.venueType", { $arrayElemAt: [venueTypeObjIds, 0] }] },
                            { $in: ["$$v.venueType", venueTypeObjIds] }
                          ]
                        }
                      }
                    }
                  },
                  0
                ]
              }
            }
          }]
          : []
      ),
      ...(time === "topRated" ? ratingStages : []),
      ...(time === "trending" ? trendingStages : []),
      { $count: "total" }
    ];

    const totalAgg = await Organizations.aggregate(countPipeline);
    const total = totalAgg?.[0]?.total || 0;

    //
    // FAVORITES
    //
    let enriched = items;

    if (userId && items.length) {
      const favs = await Favorites.find({
        user: userId,
        targetType: "organization",
        targetId: { $in: items.map(i => i._id) }
      });

      const favSet = new Set(favs.map(f => f.targetId.toString()));
      enriched = items.map(i => {
        // Format organization using shared formatter
        const formattedOrg = formatOrganization(i);

        //format hours
        if (formattedOrg?.operatingHours) {
          formattedOrg.operatingHours = transformOperatingHoursToLocal(
            formattedOrg.operatingHours,
            timezone
          );

        }
        //isOpenNow
        return {
          ...formattedOrg,
          isFavorite: favSet.has(i._id.toString())
        };
      });
    }

    return {
      status: true,
      result: {
        data: enriched,
        meta: generateMeta(page, limit, total)
      }
    };

  } catch (err) {
    throw new Error(`Failed to fetch organizations: ${err.message}`);
  }
};


const getAllData = async (queryData) => {
  try {
    const [eventsRes, placesRes] = await Promise.all([
      getEvents(queryData),
      getPlaces(queryData)
    ]);

    return {
      status: true,
      result: {
        data: {
          events: {
            items: eventsRes?.result?.data || [],
            meta: eventsRes?.result?.meta || null
          },
          places: {
            items: placesRes?.result?.data || [],
            meta: placesRes?.result?.meta || null
          }
        }
      }
    };

  } catch (error) {
    throw new Error(`Failed to fetch combined data: ${error.message}`);
  }
};

module.exports = {
  getEvents,
  getPlaces,
  getAllData,
};
