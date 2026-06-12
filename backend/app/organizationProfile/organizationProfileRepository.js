const { Events } = require("../../commonModules/events/Event");
const { Favorites } = require("../../commonModules/favorites/Favorite");
const Menus = require("../../commonModules/menuManagement/menu/Menus");
const Organizations = require("../../commonModules/organizations/Organization");
const mongoose = require("mongoose");
const Venues = require("../../commonModules/venues/Venues");
const VenueTypes = require("@VenueTypesModel");
const { formatOrganization } = require("../../commonModules/organizations/formatter/formatOrganization");
const Orders = require("@OrdersModel");
const { getUserJoinedClubs, getClubMembersCounts } = require("../loyalty/clubMembers/clubMembersRepository");
const { User } = require("@UserModel");
const { generateMeta } = require("../../helperUtils/responseUtil");
const { getUserInterestsIdsForRecommendation } = require("../usersManagement/usersRepository");
const { buildMenuItemsSaleLookup, getMenuItemsWithFilters } = require("../menuItemsAndOrdering/menuItems/menuItemsRepository");



/**
 * Fetch one organization by ID (populated)
 */
const findOrganizationById = async (userId, organizationId) => {
  let [org, favorite, orgVenue] = await Promise.all([
    Organizations.findById(organizationId)
      .populate("otherInfo.categories")
      .populate("otherInfo.tags")
      .populate("creator", "companyDetails.status companyDetails.logo companyDetails.loyaltySettings.title accountState.status")
    ,
    Favorites.exists({ user: userId, targetType: "organization", targetId: organizationId }),
    Venues.findOne({
      organization: organizationId,
      isPrimary: true
    }).select("title floorPlan venueType"),

  ]);

  //assign companyDetails.status to accountState.status for easier handling in frontend
  if (org && org.creator && org.creator.companyDetails) {
    org.creator.accountState = org.creator.accountState || {};
    org.creator.accountState.status = org.creator.companyDetails.status;
  }

  // Check if the organization is a favorite
  let isFavorite = !!favorite;

  // If venueType exists, fetch the titles of the related VenueTypes
  let venueTypeTitles = [];
  if (orgVenue && orgVenue.venueType && orgVenue.venueType.length > 0) {
    const venueTypes = await VenueTypes.find({
      _id: { $in: orgVenue.venueType }
    }).select("title");

    // Extract titles from the venueTypes documents
    venueTypeTitles = venueTypes.map(venueType => venueType.title);
  }

  // If orgVenue is found, access the clean data using _doc and add venueTypeTitles
  if (orgVenue) {
    const cleanOrgVenue = orgVenue._doc;  // Access the actual data without internal Mongoose properties
    cleanOrgVenue.venueTypeTitles = venueTypeTitles;  // Add venueTypeTitles to the clean data

    return {
      org,
      isFavorite,
      orgVenue: cleanOrgVenue,

    };
  } else {
    return {
      org,
      isFavorite,
      orgVenue: null,

    };
  }
};


/**
 * Generic queries (if needed later)
 */
const findOrganizations = async (query = {}, projection = {}, options = {}) => {
  return Organizations.find(query, projection, options)
    .populate("otherInfo.categories")
    .populate("otherInfo.tags");
};

/**
 * Count organizations by query
 */
const countOrganizations = async (query = {}) => {
  return Organizations.countDocuments(query);
};

/**
 * Update multiple organizations
 */
const updateMany = async (filter, update) => {
  return Organizations.updateMany(filter, update);
};

/**
 * Find all events for a given organization with optional date filter
 * @param {ObjectId} organizationId
 * @param {Object} filter - optional filter (e.g. { "schedule.startDateTime": { $gte: ... } })
 */
const findEventsByOrganization = async (organizationId, filter = {}, skip = 0, limit = 10) => {
  return Events.find({
    "basicInfo.organization": organizationId,
    status: "active",
    "recurringMeta.isTemplate": false,
    ...filter,
  })
    .populate("basicInfo.venue", "title location floorPlan")
    .populate("basicInfo.categories", "title image")
    .populate("basicInfo.tags", "title")
    .populate("basicInfo.organization", "basicInfo.media basicInfo.name")
    .sort({ "schedule.startDateTime": 1 })
    .skip(skip)
    .limit(limit);
};


/**
 * Count organization events — total, upcoming, and past
 */
const countEventsByOrganization = async (organizationId, now) => {
  const [globalCounts] = await Promise.all([
    // Aggregate global counts
    Events.aggregate([
      {
        $match: {
          "basicInfo.organization": new mongoose.Types.ObjectId(organizationId),
          status: { $ne: "deleted" },
          "recurringMeta.isTemplate": false,
        },
      },
      {
        $facet: {
          upcoming: [
            { $match: { "schedule.endDateTime": { $gte: now } } },
            { $count: "count" },
          ],
          past: [
            { $match: { "schedule.endDateTime": { $lt: now } } },
            { $count: "count" },
          ],
        },
      },
      {
        $project: {
          upcoming: { $ifNull: [{ $arrayElemAt: ["$upcoming.count", 0] }, 0] },
          past: { $ifNull: [{ $arrayElemAt: ["$past.count", 0] }, 0] },
        },
      },
    ]),
  ]);

  const counts = globalCounts[0] || {};
  return {
    upcoming: counts.upcoming || 0,
    past: counts.past || 0,
  };
};


/**
 * Fetch all active menus for a given organization (with first 10 items each)
 * @param {string|ObjectId} organizationId
 * @returns {Promise<Array>} Array of menus with items
 */
const getOrganizationMenuWithItems = async ({
  organizationId,
  userId = null,
  timezone = null,
  limit = 10
}) => {
  if (!organizationId) return [];

  const menu = await Menus.findOne({
    organization: organizationId,
    status: "active",
    isOrderingEnabled: true
  }).select("_id title description status");


  if (!menu) return [];

  const items = await getMenuItemsWithFilters({
    query: {
      menu: menu._id,
      status: "active"
    },
    userId,
    timezone
  });

  return [
    {
      title: menu.title,
      description: menu.description,
      status: menu.status,
      items: items.slice(0, limit)
    }
  ];
};

/**
 * Find similar organizations based on shared tags or categories.
 * Uses weighted similarity scoring.
 */
const getRecommendedOrganizations = async (organizationId, options = {}) => {
  if (!organizationId) return [];

  const orgObjId = new mongoose.Types.ObjectId(organizationId);

  // Step 1: Fetch base organization's tags and categories
  const baseOrg = await Organizations.findById(orgObjId)
    .select("otherInfo.tags otherInfo.categories")
    .lean();

  if (!baseOrg) return [];

  const tags = baseOrg.otherInfo?.tags || [];
  const categories = baseOrg.otherInfo?.categories || [];

  if (!tags.length && !categories.length) return [];

  // Step 2: Define weights
  const weights = getSimilarityWeights(options);

  const result = await Organizations.aggregate([
    /* ===============================
       1️⃣ BASE MATCH
    =============================== */
    {
      $match: {
        _id: { $ne: orgObjId },
        status: "active",
        $or: [
          { "otherInfo.tags": { $in: tags } },
          { "otherInfo.categories": { $in: categories } }
        ]
      }
    },

    /* ===============================
       2️⃣ MATCH COUNTS
    =============================== */
    {
      $addFields: {
        matchedTags: { $setIntersection: ["$otherInfo.tags", tags] },
        matchedCategories: { $setIntersection: ["$otherInfo.categories", categories] }
      }
    },

    /* ===============================
       3️⃣ SIMILARITY SCORE
    =============================== */
    {
      $addFields: {
        similarityScore: {
          $add: [
            { $multiply: [{ $size: "$matchedTags" }, weights.tagWeight] },
            { $multiply: [{ $size: "$matchedCategories" }, weights.categoryWeight] }
          ]
        }
      }
    },

    { $match: { similarityScore: { $gt: 0 } } },

    { $sort: { similarityScore: -1, createdAt: -1 } },

    { $limit: options.limit || 10 },

    /* ===============================
       4️⃣ PRIMARY VENUE
    =============================== */
    {
      $lookup: {
        from: "venues",
        let: { orgId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$organization", "$$orgId"] },
              isPrimary: true,
              status: "active"
            }
          },
          {
            $project: {
              _id: 0,
              venueType: 1
            }
          }
        ],
        as: "primaryVenue"
      }
    },

    /* ===============================
       5️⃣ VENUE TYPES
    =============================== */
    {
      $lookup: {
        from: "venuetypes",
        localField: "primaryVenue.venueType",
        foreignField: "_id",
        as: "venueTypes",
        pipeline: [{ $project: { _id: 1, title: 1 } }]
      }
    },

    /* ===============================
       6️⃣ TAGS
    =============================== */
    {
      $lookup: {
        from: "tags",
        localField: "otherInfo.tags",
        foreignField: "_id",
        as: "tags",
        pipeline: [{ $project: { _id: 1, title: 1 } }]
      }
    },

    /* ===============================
       7️⃣ FINAL SHAPE
    =============================== */
    {
      $project: {
        _id: 1,
        "basicInfo.name": 1,
        "basicInfo.media": 1,
        "otherInfo.description": 1,
        operatingHours: 1,

        tags: 1,

        venue: {
          venueType: "$venueTypes"
        },

        similarityScore: 1
      }
    }
  ]);

  return result;
};

/**
 * Configurable similarity weight function
 * Can be based on env, request options, or dynamic tuning.
 */
function getSimilarityWeights(options = {}) {
  return {
    tagWeight: options.tagWeight ?? 1.0,        // Default: 1x weight for tag overlap
    categoryWeight: options.categoryWeight ?? 1.5, // Default: 1.5x for categories
  };
}


/**
 * Get nearby organizations and include active order number for the user (if any).
 * @param {Object} params - { location, radiusKm, timezone, page, limit, userId }
 * @returns {Promise<{ organizations: Array }>}
 */
const getNearbyOrganizations = async ({
  category,
  userLocation,
  radiusKm,
  timezone,
  page,
  limit,
  skip,
  userId,
  ctx
}) => {


  /* =====================================================
     ADVANCE FILTERS
     ===================================================== */

  const advanceFilters = ctx?.advanceFilters || {};

  const filterCategories = (advanceFilters.categories || [])
    .filter(Boolean)
    .map(id => new mongoose.Types.ObjectId(id));

  const filterTags = (advanceFilters.tags || [])
    .filter(Boolean)
    .map(id => new mongoose.Types.ObjectId(id));

  const filterVenueTypes = (advanceFilters.venueTypes || [])
    .filter(Boolean)
    .map(id => new mongoose.Types.ObjectId(id));

  const distanceFrom = Number(
    advanceFilters.distanceFrom || 0
  );

  const distanceTo = Number(
    advanceFilters.distanceTo || radiusKm
  );

  let sortDirection = 1
  if (ctx?.sort === "desc") {
    sortDirection = -1;
  }

  /* =====================================================
     CATEGORY
     ===================================================== */

  let categoryObjectId = [];

  if (category) {

    const categoryIds = Array.isArray(category)
      ? category
      : [category];

    categoryObjectId = categoryIds
      .filter(Boolean)
      .map(
        id => new mongoose.Types.ObjectId(id)
      );
  }

  /* =====================================================
     GEO QUERY
     ===================================================== */

  const geoQuery = {
    status: "active"
  };

  // existing category behavior
  if (!ctx && categoryObjectId.length) {
    geoQuery["otherInfo.categories"] = {
      $in: categoryObjectId
    };
  }

  // ctx category filters
  if (ctx && filterCategories.length) {
    geoQuery["otherInfo.categories"] = {
      $in: filterCategories
    };
  }

  // ctx tag filters
  if (ctx && filterTags.length) {
    geoQuery["otherInfo.tags"] = {
      $in: filterTags
    };
  }

  const pipeline = [];

  /* =====================================================
     GEO
     ===================================================== */

  if (userLocation) {

    const geoNearStage = {
      near: userLocation,
      key: "location",
      distanceField: "distance",
      spherical: true,
      maxDistance: (
        ctx
          ? distanceTo
          : radiusKm
      ) * 1000,
      query: geoQuery
    };

    if (ctx && distanceFrom > 0) {
      geoNearStage.minDistance =
        distanceFrom * 1000;
    }

    pipeline.push(
      {
        $geoNear: geoNearStage
      },
      {
        $sort: {
          distance: sortDirection
        }
      }
    );

  } else {

    pipeline.push(
      {
        $match: geoQuery
      },
      {
        $sort: {
          createdAt: sortDirection
        }
      }
    );

  }

  /* ===============================
     PRIMARY VENUE → POPULATE venueType
     =============================== */

  pipeline.push(
    {
      $lookup: {
        from: "venues",
        let: { orgId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: [
                  "$organization",
                  "$$orgId"
                ]
              },
              isPrimary: true,
              status: "active"
            }
          },
          {
            $project: {
              _id: 0,
              venueType: 1
            }
          }
        ],
        as: "primaryVenue"
      }
    },

    {
      $lookup: {
        from: "venuetypes",
        localField: "primaryVenue.venueType",
        foreignField: "_id",
        as: "venueTypes",
        pipeline: [
          {
            $project: {
              _id: 1,
              title: 1
            }
          }
        ]
      }
    }
  );

  /* =====================================================
     VENUE TYPE FILTER
     ===================================================== */

  if (
    ctx &&
    filterVenueTypes.length
  ) {
    pipeline.push({
      $match: {
        "venueTypes._id": {
          $in: filterVenueTypes
        }
      }
    });
  }

  /* ===============================
     TAGS
     =============================== */

  pipeline.push({
    $lookup: {
      from: "tags",
      localField: "otherInfo.tags",
      foreignField: "_id",
      as: "tags",
      pipeline: [
        {
          $project: {
            _id: 1,
            title: 1
          }
        }
      ]
    }
  });

  /* ===============================
     TOTAL COUNT
     =============================== */

  const countPipeline = [...pipeline];

  countPipeline.push({
    $count: "totalCount"
  });

  /* ===============================
     PAGINATION
     =============================== */

  pipeline.push(
    {
      $skip: skip
    },
    {
      $limit: limit
    }
  );

  /* ===============================
     FINAL SHAPE
     =============================== */

  pipeline.push({
    $project: {
      _id: 1,

      "basicInfo.name": 1,
      "basicInfo.media": 1,
      otherInfo: 1,
      location: 1,

      operatingHours: 1,

      distance: userLocation
        ? 1
        : null,

      tags: 1,

      venue: {
        venueType: "$venueTypes"
      }
    }
  });

  const [
    organizations,
    countResult
  ] = await Promise.all([
    Organizations.aggregate(pipeline),
    ctx
      ? Organizations.aggregate(countPipeline)
      : Promise.resolve([])
  ]);

  return {
    organizations,
    totalCount:
      ctx && countResult[0]
        ? countResult[0].totalCount
        : 0
  };
};






//get organization with custom .select filters
const findOrganizationWithSelectFilter = async (organizationId, selectFields) => {
  return Organizations.findById(organizationId)
    .where({ status: "active" })
    .select(selectFields).lean().exec();
};

//get suggested loyalty clubs
const getSuggestedLoyaltyClubsForUser = async ({
  page = 1,
  limit = 10,
  userId,
  keyword
}) => {

  const joinedClubIds = await getUserJoinedClubs(userId);
  const filter = {
    _id: { $nin: joinedClubIds },
    "accountState.status": "active",
    "accountState.userType": "organizer",
    "companyDetails.loyaltySettings.isEnabled": true,
  };

  if (keyword) {
    filter["companyDetails.loyaltySettings.title"] = {
      $regex: keyword,
      $options: "i"
    };
  }

  const [result, count] = await Promise.all([
    User.find(filter)
      .select("companyDetails.logo companyDetails.loyaltySettings.title")
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(filter)
  ]);

  const meta = generateMeta(page, limit, count || 0);

  return { result, meta };
};

//get suggested loyalty clubs for home api
const getSuggestedLoyaltyClubsForHome = async ({
  page = 1,
  limit = 10,
  skip = 0,
  userId,
  userLocation,
  radiusKm = 50
}) => {

  const joinedClubs = await getUserJoinedClubs(userId);
  const joinedClubIds = joinedClubs.map(c => c.companyOrganizer);

  const nearbyCompanyIds = await getCompanyOrganizersWithinRadius({
    userLocation,
    radiusKm
  });

  if (!nearbyCompanyIds.length) {
    return {
      data: [],
      totalCount: 0
    };
  }

  /* ===============================
     BASE MATCH (REUSED FOR COUNT)
     =============================== */
  const baseMatch = {
    _id: {
      $in: nearbyCompanyIds,
      $nin: joinedClubIds
    },
    "accountState.status": "active",
    "accountState.userType": "organizer",
    "companyDetails.loyaltySettings.isEnabled": true,
    "companyDetails.loyaltySettings.title": { $exists: true, $ne: "" }
  };

  /* ===============================
     MAIN PIPELINE
     =============================== */
  const pipeline = [
    { $match: baseMatch },

    {
      $lookup: {
        from: "clubmembers",
        localField: "_id",
        foreignField: "companyOrganizer",
        pipeline: [
          { $match: { status: { $ne: "left" } } },
          { $count: "count" }
        ],
        as: "members"
      }
    },
    {
      $addFields: {
        membersCount: { $ifNull: [{ $first: "$members.count" }, 0] }
      }
    },

    {
      $lookup: {
        from: "organizations",
        localField: "_id",
        foreignField: "creator",
        pipeline: [{ $match: { status: "active" } }],
        as: "orgs"
      }
    },
    {
      $addFields: {
        organizationsCount: { $size: "$orgs" }
      }
    },

    {
      $match: {
        organizationsCount: { $gt: 0 }
      }
    },

    {
      $lookup: {
        from: "engagementevents",
        let: { companyId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$entityType", "users"] },
                  { $eq: ["$entityId", "$$companyId"] },
                  { $eq: ["$action", "view"] }
                ]
              }
            }
          },
          { $count: "views" }
        ],
        as: "popularity"
      }
    },
    {
      $addFields: {
        viewsCount: { $ifNull: [{ $first: "$popularity.views" }, 0] }
      }
    },

    {
      $addFields: {
        membersScore: { $round: [{ $log10: { $add: ["$membersCount", 1] } }, 2] },
        popularityScore: { $round: [{ $log10: { $add: ["$viewsCount", 1] } }, 2] },
        relevanceScore: { $round: [{ $log10: { $add: ["$organizationsCount", 1] } }, 2] }
      }
    },
    {
      $addFields: {
        finalScore: {
          $round: [
            {
              $add: [
                { $multiply: ["$membersScore", 0.3] },
                { $multiply: ["$popularityScore", 0.2] },
                { $multiply: ["$relevanceScore", 0.5] }
              ]
            },
            2
          ]
        }
      }
    }
  ];

  /* ===============================
     COUNT PIPELINE (BEFORE PAGINATION)
     =============================== */
  const countPipeline = [...pipeline, { $count: "totalCount" }];

  /* ===============================
     PAGINATION + FINAL SHAPE
     =============================== */
  pipeline.push(
    { $sort: { finalScore: -1 } },
    { $skip: skip },
    { $limit: limit },
    {
      $project: {
        _id: 1,
        companyDetails: {
          logo: 1,
          loyaltySettings: { title: 1 }
        },
        explain: {
          membersCount: 1,
          organizationsCount: 1,
          viewsCount: 1,
          finalScore: 1
        }
      }
    }
  );

  const [data, countResult] = await Promise.all([
    User.aggregate(pipeline),
    User.aggregate(countPipeline)
  ]);

  return {
    data,
    totalCount: countResult[0]?.totalCount || 0
  };
};


const getCompanyOrganizersWithinRadius = async ({
  userLocation,
  radiusKm = 50
}) => {

  // 🌍 GLOBAL MODE — no geo filter
  if (!userLocation) {
    const result = await Organizations.aggregate([
      {
        $match: {
          status: "active",
          creator: { $exists: true, $ne: null }
        }
      },
      { $group: { _id: "$creator" } }
    ]);

    return result.map(r => r._id);
  }

  // 📍 GEO MODE — only when valid coordinates
  const result = await Organizations.aggregate([
    {
      $geoNear: {
        near: userLocation,             // GeoJSON: { type:"Point", coordinates:[lng,lat] }
        key: "location",
        distanceField: "distance",
        spherical: true,
        maxDistance: radiusKm * 1000,
        query: { status: "active" }
      }
    },
    { $group: { _id: "$creator" } }
  ]);

  return result.map(r => r._id);
};

//get organization creator
const getOrgCompanyOrganizer = async (organizationId) => {
  const org = await Organizations.findById(organizationId).select("creator").lean();
  return org ? org.creator : null;
}

const getOrganizationsGroupedByVenueTypesRepo = async ({
  location,
  radiusKm,
}) => {
  const radiusMeters = radiusKm * 1000;

  const pipeline = [
    // ✅ MUST BE FIRST
    {
      $geoNear: {
        near: { type: "Point", coordinates: location },
        distanceField: "distance",
        spherical: true,
        maxDistance: radiusMeters,
        query: { status: "active" },
      },
    },

    // 2️⃣ Bring venues
    {
      $lookup: {
        from: "venues",
        localField: "_id",
        foreignField: "organization",
        as: "venues",
      },
    },
    { $unwind: "$venues" },

    // 3️⃣ Only active venues
    {
      $match: {
        "venues.status": "active",
      },
    },

    // 4️⃣ Venue Types
    {
      $lookup: {
        from: "venuetypes",
        localField: "venues.venueType",
        foreignField: "_id",
        as: "venueType",
      },
    },
    { $unwind: "$venueType" },

    // 5️⃣ Shape data
    {
      $project: {
        venueTypeId: "$venueType._id",
        venueTypeTitle: "$venueType.title",

        organization: {
          _id: "$_id",
          "basicInfo.name": "$basicInfo.name",
          "basicInfo.media": "$basicInfo.media",
          creator: "$creator",
          distance: "$distance",
        },
      },
    },

    // 6️⃣ Group by venueType
    {
      $group: {
        _id: "$venueTypeId",
        title: { $first: "$venueTypeTitle" },
        data: { $addToSet: "$organization" },
      },
    },

    // 7️⃣ Final UI shape
    {
      $project: {
        _id: 0,
        key: { $literal: "customCategory" },
        title: 1,
        data: 1,
      },
    },
  ];

  return Organizations.aggregate(pipeline);
};


/* 
categoryMatch = matchedCategories / userCategoriesCount
tagMatch      = matchedTags / userTagsCount

relevanceScore =
  0.6 * categoryMatch +
  0.4 * tagMatch

popularityScore =
  0.6 * ln(1 + favoritesCount) +
  0.4 * ln(1 + viewsCount)

finalScore =
  0.7 * relevanceScore +
  0.3 * popularityScore
x
*/

const getForYouOrganizationsForHomeRepo = async ({
  category,
  userLocation,
  radiusKm = 50,
  page = 1,
  limit = 50,
  skip = 0,
  userId,
  timezone,
  ctx
}) => {

  /* =====================================================
     ADVANCE FILTERS
     ONLY APPLIED WHEN CTX EXISTS
     ===================================================== */

  const advanceFilters = ctx?.advanceFilters || {};

  const filterCategories = (advanceFilters.categories || [])
    .filter(Boolean)
    .map(id => new mongoose.Types.ObjectId(id));

  const filterTags = (advanceFilters.tags || [])
    .filter(Boolean)
    .map(id => new mongoose.Types.ObjectId(id));

  // const filterGenres = (advanceFilters.genre || [])
  //   .filter(Boolean)
  //   .map(id => new mongoose.Types.ObjectId(id));

  const filterVenueTypes = (advanceFilters.venueTypes || [])
    .filter(Boolean)
    .map(id => new mongoose.Types.ObjectId(id));

  const distanceFrom = Number(
    advanceFilters.distanceFrom || 0
  );

  const distanceTo = Number(
    advanceFilters.distanceTo || radiusKm
  );

  const sortDirection =
    ctx?.sort === "asc" ? 1 : -1;

  /* =====================================================
     EXISTING RECOMMENDATION FUNCTIONALITY
     ===================================================== */

  let userCategories = [];
  let userTags = [];

  let geoQuery = {
    status: "active"
  };


  /* =====================================================
   ALWAYS LOAD USER PREFERENCES
   ===================================================== */

  const userPreferences =
    await getUserInterestsIdsForRecommendation(userId);

  userCategories =
    (userPreferences?.categories || []).map(
      id => new mongoose.Types.ObjectId(id)
    );

  userTags =
    (userPreferences?.tags || []).map(
      id => new mongoose.Types.ObjectId(id)
    );

  /* =====================================================
     DEFAULT CATEGORY FLOW
     ===================================================== */

  if (!ctx && category) {
    geoQuery["otherInfo.categories"] = {
      $in: [
        new mongoose.Types.ObjectId(category)
      ]
    };
  }

  /* =====================================================
     CTX STRICT FILTERS
     ===================================================== */

  if (ctx) {

    // strict category filtering
    if (filterCategories.length) {
      geoQuery["otherInfo.categories"] = {
        $in: filterCategories
      };
    }

    // strict tags filtering
    if (filterTags.length) {
      geoQuery["otherInfo.tags"] = {
        $in: filterTags
      };
    }
  }



  const pipeline = [];

  /* =====================================================
     GEO
     ===================================================== */

  if (userLocation) {

    const geoNearStage = {
      near: userLocation,
      key: "location",
      distanceField: "distance",
      spherical: true,
      maxDistance: (
        ctx
          ? distanceTo
          : radiusKm
      ) * 1000,
      query: geoQuery
    };

    // only apply minDistance when ctx exists
    if (ctx && distanceFrom > 0) {
      geoNearStage.minDistance =
        distanceFrom * 1000;
    }

    pipeline.push({
      $geoNear: geoNearStage
    });

  } else {

    pipeline.push({
      $match: geoQuery
    });

  }

  pipeline.push({
    $project: {
      basicInfo: 1,
      otherInfo: 1,
      operatingHours: 1,
      distance: 1,
      location: 1
    }
  });

  /* =====================================================
     PRIMARY VENUE
     ===================================================== */

  pipeline.push(
    {
      $lookup: {
        from: "venues",
        let: { orgId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: [
                  "$organization",
                  "$$orgId"
                ]
              },
              isPrimary: true,
              status: "active"
            }
          },
          {
            $project: {
              venueType: 1
            }
          }
        ],
        as: "primaryVenue"
      }
    },
    {
      $lookup: {
        from: "venuetypes",
        localField: "primaryVenue.venueType",
        foreignField: "_id",
        as: "venueTypes",
        pipeline: [
          {
            $project: {
              _id: 1,
              title: 1
            }
          }
        ]
      }
    }
  );

  /* =====================================================
     VENUE TYPE FILTER
     ONLY IN CTX MODE
     ===================================================== */

  if (
    ctx &&
    filterVenueTypes.length
  ) {
    pipeline.push({
      $match: {
        "venueTypes._id": {
          $in: filterVenueTypes
        }
      }
    });
  }

  /* =====================================================
     TAGS LOOKUP
     ===================================================== */

  pipeline.push({
    $lookup: {
      from: "tags",
      localField: "otherInfo.tags",
      foreignField: "_id",
      as: "tags",
      pipeline: [
        {
          $project: {
            _id: 1,
            title: 1
          }
        }
      ]
    }
  });

  /* =====================================================
     INTEREST MATCH
     ===================================================== */

  pipeline.push({
    $addFields: {
      matchedCategories: {
        $size: {
          $setIntersection: [
            "$otherInfo.categories",
            userCategories
          ]
        }
      },
      matchedTags: {
        $size: {
          $setIntersection: [
            "$otherInfo.tags",
            userTags
          ]
        }
      }
    }
  });

  /* =====================================================
     RELEVANCE SCORE
     ===================================================== */

  pipeline.push({
    $addFields: {
      relevanceScore: {
        $add: [
          {
            $multiply: [
              0.6,
              {
                $cond: [
                  {
                    $gt: [
                      userCategories.length,
                      0
                    ]
                  },
                  {
                    $divide: [
                      "$matchedCategories",
                      userCategories.length
                    ]
                  },
                  0
                ]
              }
            ]
          },
          {
            $multiply: [
              0.4,
              {
                $cond: [
                  {
                    $gt: [
                      userTags.length,
                      0
                    ]
                  },
                  {
                    $divide: [
                      "$matchedTags",
                      userTags.length
                    ]
                  },
                  0
                ]
              }
            ]
          }
        ]
      }
    }
  });

  /* =====================================================
     ENGAGEMENT
     ===================================================== */

  pipeline.push(
    {
      $lookup: {
        from: "engagementevents",
        let: { orgId: "$_id" },
        pipeline: [
          {
            $match: {
              entityType: "organizations",
              $expr: {
                $eq: [
                  "$entityId",
                  "$$orgId"
                ]
              }
            }
          },
          {
            $group: {
              _id: "$action",
              count: {
                $sum: 1
              }
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
                      input:
                        "$engagementStats",
                      as: "s",
                      cond: {
                        $eq: [
                          "$$s._id",
                          "view"
                        ]
                      }
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
                      input:
                        "$engagementStats",
                      as: "s",
                      cond: {
                        $eq: [
                          "$$s._id",
                          "favorite"
                        ]
                      }
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

  /* =====================================================
     POPULARITY SCORE
     ===================================================== */

  pipeline.push({
    $addFields: {
      popularityScore: {
        $add: [
          {
            $multiply: [
              0.6,
              {
                $ln: {
                  $add: [
                    1,
                    "$favoritesCount"
                  ]
                }
              }
            ]
          },
          {
            $multiply: [
              0.4,
              {
                $ln: {
                  $add: [
                    1,
                    "$viewsCount"
                  ]
                }
              }
            ]
          }
        ]
      }
    }
  });

  /* =====================================================
     FINAL SCORE
     ===================================================== */

  pipeline.push({
    $addFields: {
      finalScore: {
        $round: [
          {
            $add: [
              {
                $multiply: [
                  0.7,
                  "$relevanceScore"
                ]
              },
              {
                $multiply: [
                  0.3,
                  "$popularityScore"
                ]
              }
            ]
          },
          2
        ]
      }
    }
  });

  /* =====================================================
     SORT + PAGINATION
     ===================================================== */

  //let countPipleLine without skip and limit
  const countPipeline = [...pipeline];
  countPipeline.push({
    $count: "totalCount"
  });


  pipeline.push(
    {
      $sort: {
        finalScore: sortDirection
      }
    },
    {
      $skip: skip
    },
    {
      $limit: limit
    }
  );

  /* =====================================================
     FINAL SHAPE
     ===================================================== */

  pipeline.push({
    $project: {
      _id: 1,
      distance: userLocation ? 1 : null,
      basicInfo: 1,
      otherInfo: 1,
      location: 1,
      operatingHours: 1,
      tags: 1,
      venue: {
        venueType: "$venueTypes"
      },
      finalScore: 1
    }
  });

  //total count without limit and skip (for pagination meta)
  if (ctx) {
    const countResult = await Organizations.aggregate(countPipeline);
    ctx.totalCount = countResult[0] ? countResult[0].totalCount : 0;
  }
  return {
    organizations: await Organizations.aggregate(pipeline),
    totalCount: ctx?.totalCount || 0
  }
};




const getTrendingOrganizationsForHomeRepo = async ({
  userLocation,
  radiusKm = 50,
  category = null,
  limit = 10,
  skip = 0,
  ctx
}) => {

  /* =====================================================
     ADVANCE FILTERS (CTX ONLY)
     ===================================================== */

  const advanceFilters = ctx?.advanceFilters || {};

  const filterCategories = (advanceFilters.categories || [])
    .filter(Boolean)
    .map(id => new mongoose.Types.ObjectId(id));

  const filterTags = (advanceFilters.tags || [])
    .filter(Boolean)
    .map(id => new mongoose.Types.ObjectId(id));

  const filterVenueTypes = (advanceFilters.venueTypes || [])
    .filter(Boolean)
    .map(id => new mongoose.Types.ObjectId(id));

  /* =====================================================
     CATEGORY MERGE
     ===================================================== */

  let categoryObjectIds = [];

  if (category) {
    const arr = Array.isArray(category)
      ? category
      : [category];

    categoryObjectIds = arr
      .filter(Boolean)
      .map(id => new mongoose.Types.ObjectId(id));
  }

  const finalCategories =
    ctx && filterCategories.length
      ? filterCategories
      : categoryObjectIds;

  /* =====================================================
     TIME WINDOWS
     ===================================================== */

  const now = Date.now();
  const last48h = new Date(now - 48 * 60 * 60 * 1000);
  const last7d = new Date(now - 7 * 24 * 60 * 60 * 1000);

  const pipeline = [];

  /* =====================================================
     BASE QUERY
     ===================================================== */

  const baseQuery = {
    status: "active"
  };

  if (finalCategories.length) {
    baseQuery["otherInfo.categories"] = {
      $in: finalCategories
    };
  }

  /* =====================================================
     GEO / MATCH
     ===================================================== */

  if (userLocation) {
    pipeline.push({
      $geoNear: {
        near: userLocation,
        key: "location",
        distanceField: "distance",
        spherical: true,
        maxDistance: radiusKm * 1000,
        query: baseQuery
      }
    });
  } else {
    pipeline.push({
      $match: baseQuery
    });
  }

  /* =====================================================
     ENGAGEMENT SCORE
     ===================================================== */

  pipeline.push(
    {
      $lookup: {
        from: "engagementevents",
        let: { orgId: "$_id" },
        pipeline: [
          {
            $match: {
              entityType: "organizations",
              action: "view",
              $expr: {
                $eq: ["$entityId", "$$orgId"]
              },
              createdAt: { $gte: last7d }
            }
          },
          {
            $group: {
              _id: null,
              views7d: { $sum: 1 },
              views48h: {
                $sum: {
                  $cond: [
                    { $gte: ["$createdAt", last48h] },
                    1,
                    0
                  ]
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
        views7d: {
          $ifNull: [
            { $first: "$engagementStats.views7d" },
            0
          ]
        },
        views48h: {
          $ifNull: [
            { $first: "$engagementStats.views48h" },
            0
          ]
        }
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
    }
  );

  /* =====================================================
     VENUE + TYPE
     ===================================================== */

  pipeline.push(
    {
      $lookup: {
        from: "venues",
        let: { orgId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ["$organization", "$$orgId"]
              },
              isPrimary: true,
              status: "active"
            }
          },
          { $project: { venueType: 1 } }
        ],
        as: "primaryVenue"
      }
    },
    {
      $lookup: {
        from: "venuetypes",
        localField: "primaryVenue.venueType",
        foreignField: "_id",
        as: "venueTypes",
        pipeline: [
          { $project: { _id: 1, title: 1 } }
        ]
      }
    }
  );

  /* =====================================================
     VENUE TYPE FILTER (CTX ONLY)
     ===================================================== */

  if (ctx && filterVenueTypes.length) {
    pipeline.push({
      $match: {
        "venueTypes._id": {
          $in: filterVenueTypes
        }
      }
    });
  }

  /* =====================================================
     TAGS + CTX FILTER
     ===================================================== */

  pipeline.push({
    $lookup: {
      from: "tags",
      localField: "otherInfo.tags",
      foreignField: "_id",
      as: "tags",
      pipeline: [
        { $project: { _id: 1, title: 1 } }
      ]
    }
  });

  if (ctx && filterTags.length) {
    pipeline.push({
      $match: {
        "otherInfo.tags": {
          $in: filterTags
        }
      }
    });
  }

  /* =====================================================
     COUNT PIPELINE (BEFORE PAGINATION)
     ===================================================== */

  const countPipeline = [...pipeline];

  countPipeline.push({
    $count: "totalCount"
  });

  /* =====================================================
     SORT + PAGINATION
     ===================================================== */

  pipeline.push(
    { $sort: { trendingScore: -1 } },
    { $skip: skip },
    { $limit: limit }
  );

  /* =====================================================
     FINAL SHAPE
     ===================================================== */

  pipeline.push({
    $project: {
      _id: 1,
      distance: userLocation ? 1 : null,
      "basicInfo.name": 1,
      "basicInfo.media": 1,
      "otherInfo": 1,
      "location": 1,
      operatingHours: 1,
      tags: 1,
      views48h: 1,
      views7d: 1,
      trendingScore: 1,
      venue: {
        venueType: "$venueTypes"
      }
    }
  });

  /* =====================================================
     EXECUTION
     ===================================================== */

  const [organizations, countResult] = await Promise.all([
    Organizations.aggregate(pipeline),
    Organizations.aggregate(countPipeline)
  ]);

  return {
    organizations,
    totalCount: countResult[0]?.totalCount || 0
  };
};

const getNewlyListedOrganizationsRepo = async ({
  category,
  userLocation,
  radiusKm = 50,
  page = 1,
  limit = 10,
  skip = 0,
  ctx
}) => {

  /* =====================================================
     ADVANCE FILTERS (CTX ONLY)
     ===================================================== */

  const advanceFilters = ctx?.advanceFilters || {};

  const filterCategories = (advanceFilters.categories || [])
    .filter(Boolean)
    .map(id => new mongoose.Types.ObjectId(id));

  const filterTags = (advanceFilters.tags || [])
    .filter(Boolean)
    .map(id => new mongoose.Types.ObjectId(id));

  const filterVenueTypes = (advanceFilters.venueTypes || [])
    .filter(Boolean)
    .map(id => new mongoose.Types.ObjectId(id));

  /* =====================================================
     CATEGORY MERGE (CTX vs INPUT)
     ===================================================== */

  let categoryObjectIds = [];

  if (category) {
    const arr = Array.isArray(category) ? category : [category];

    categoryObjectIds = arr
      .filter(Boolean)
      .map(id => new mongoose.Types.ObjectId(id));
  }

  const finalCategories =
    ctx && filterCategories.length
      ? filterCategories
      : categoryObjectIds;

  /* =====================================================
     BASE QUERY
     ===================================================== */

  const baseQuery = {
    status: "active"
  };

  if (finalCategories.length) {
    baseQuery["otherInfo.categories"] = {
      $in: finalCategories
    };
  }

  /* =====================================================
     PIPELINE
     ===================================================== */

  const pipeline = [];

  /* ===============================
     GEO / MATCH
     =============================== */

  if (userLocation) {
    pipeline.push({
      $geoNear: {
        near: userLocation,
        key: "location",
        distanceField: "distance",
        spherical: true,
        maxDistance: radiusKm * 1000,
        query: baseQuery
      }
    });
  } else {
    pipeline.push({
      $match: baseQuery
    });
  }

  /* ===============================
     AGE (RECENCY)
     =============================== */

  pipeline.push({
    $addFields: {
      ageDays: {
        $divide: [
          { $subtract: [new Date(), "$createdAt"] },
          1000 * 60 * 60 * 24
        ]
      }
    }
  });

  /* ===============================
     ENGAGEMENT
     =============================== */

  pipeline.push(
    {
      $lookup: {
        from: "engagementevents",
        let: { orgId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$entityType", "organizations"] },
                  { $eq: ["$entityId", "$$orgId"] }
                ]
              }
            }
          },
          { $count: "count" }
        ],
        as: "popularity"
      }
    },
    {
      $addFields: {
        popularityCount: {
          $ifNull: [{ $first: "$popularity.count" }, 0]
        }
      }
    }
  );

  /* ===============================
     SCORES
     =============================== */

  pipeline.push(
    {
      $addFields: {
        recencyScore: {
          $round: [
            {
              $ln: {
                $add: [1, { $subtract: [365, "$ageDays"] }]
              }
            },
            2
          ]
        },
        popularityScore: {
          $round: [
            {
              $ln: {
                $add: [1, "$popularityCount"]
              }
            },
            2
          ]
        }
      }
    },
    {
      $addFields: {
        finalScore: {
          $round: [
            {
              $add: [
                { $multiply: ["$recencyScore", 0.8] },
                { $multiply: ["$popularityScore", 0.2] }
              ]
            },
            2
          ]
        }
      }
    }
  );

  /* ===============================
     VENUE + TYPE
     =============================== */

  pipeline.push(
    {
      $lookup: {
        from: "venues",
        let: { orgId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$organization", "$$orgId"] },
              isPrimary: true,
              status: "active"
            }
          },
          {
            $project: {
              _id: 0,
              venueType: 1
            }
          }
        ],
        as: "primaryVenue"
      }
    },
    {
      $lookup: {
        from: "venuetypes",
        localField: "primaryVenue.venueType",
        foreignField: "_id",
        as: "venueTypes",
        pipeline: [
          { $project: { _id: 1, title: 1 } }
        ]
      }
    }
  );

  /* ===============================
     TAGS (CTX FILTER)
     =============================== */

  pipeline.push({
    $lookup: {
      from: "tags",
      localField: "otherInfo.tags",
      foreignField: "_id",
      as: "tags",
      pipeline: [
        { $project: { _id: 1, title: 1 } }
      ]
    }
  });

  if (ctx && filterTags.length) {
    pipeline.push({
      $match: {
        "otherInfo.tags": {
          $in: filterTags
        }
      }
    });
  }

  /* ===============================
     VENUE TYPE FILTER (CTX ONLY)
     =============================== */

  if (ctx && filterVenueTypes.length) {
    pipeline.push({
      $match: {
        "venueTypes._id": {
          $in: filterVenueTypes
        }
      }
    });
  }

  /* ===============================
     COUNT PIPELINE (BEFORE PAGINATION)
     =============================== */

  const countPipeline = [...pipeline];
  countPipeline.push({ $count: "totalCount" });

  /* ===============================
     SORT + PAGINATION
     =============================== */

  pipeline.push(
    { $sort: { finalScore: -1 } },
    { $skip: skip },
    { $limit: limit }
  );

  /* ===============================
     FINAL SHAPE
     =============================== */

  pipeline.push({
    $project: {
      _id: 1,
      createdAt: 1,
      distance: userLocation ? 1 : null,
      "basicInfo.name": 1,
      "basicInfo.media": 1,
      "otherInfo": 1,
      "location": 1,
      operatingHours: 1,
      tags: 1,

      venue: {
        venueType: "$venueTypes"
      },

      explain: {
        ageDays: { $round: ["$ageDays", 1] },
        popularityCount: "$popularityCount",
        recencyScore: "$recencyScore",
        popularityScore: "$popularityScore",
        finalScore: "$finalScore"
      }
    }
  });

  /* ===============================
     EXECUTION
     =============================== */

  const [organizations, countResult] = await Promise.all([
    Organizations.aggregate(pipeline),
    Organizations.aggregate(countPipeline)
  ]);

  return {
    organizations,
    totalCount: countResult[0]?.totalCount || 0
  };
};




const getOrganizationsGroupedByTagsRepo = async ({
  userLocation,
  radiusKm,
  limitPerTag = 10,
  category
}) => {
  const radiusMeters = (radiusKm || 0) * 1000;

  const categoryObjectId = category
    ? new mongoose.Types.ObjectId(category)
    : null;

  const baseMatch = {
    status: "active",
    ...(categoryObjectId && {
      "otherInfo.categories": { $in: [categoryObjectId] }
    })
  };

  const pipeline = [];

  /**
   * -------------------------------------
   * 1️⃣ GEO (optional)
   * -------------------------------------
   */
  if (userLocation) {
    pipeline.push({
      $geoNear: {
        near: userLocation,
        key: "location",
        distanceField: "distance",
        spherical: true,
        maxDistance: radiusMeters,
        query: baseMatch
      }
    });
  } else {
    pipeline.push({ $match: baseMatch });

    pipeline.push({
      $addFields: { distance: null }
    });
  }

  /**
   * -------------------------------------
   * 2️⃣ PRIMARY TAG
   * -------------------------------------
   */
  pipeline.push(
    {
      $addFields: {
        primaryTag: { $arrayElemAt: ["$otherInfo.tags", 0] }
      }
    },
    { $match: { primaryTag: { $ne: null } } },

    /**
     * -------------------------------------
     * 3️⃣ BASE PROJECTION
     * -------------------------------------
     */
    {
      $project: {
        _id: 1,
        distance: 1,
        basicInfo: 1,
        primaryTag: 1
      }
    }
  );

  /**
   * -------------------------------------
   * 4️⃣ PRIMARY VENUE + VENUE TYPE
   * -------------------------------------
   */
  pipeline.push(
    {
      $lookup: {
        from: "venues",
        let: { orgId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$organization", "$$orgId"] },
              isPrimary: true,
              status: "active"
            }
          },

          // Populate venueType (array)
          {
            $lookup: {
              from: "venuetypes",
              localField: "venueType",
              foreignField: "_id",
              as: "venueType"
            }
          },

          {
            $project: {
              venueType: {
                _id: 1,
                title: 1
              }
            }
          }
        ],
        as: "primaryVenue"
      }
    },
    {
      $unwind: {
        path: "$primaryVenue",
        preserveNullAndEmptyArrays: true
      }
    }
  );

  /**
   * -------------------------------------
   * 5️⃣ TAG LOOKUP
   * -------------------------------------
   */
  pipeline.push(
    {
      $lookup: {
        from: "tags",
        localField: "primaryTag",
        foreignField: "_id",
        as: "tag"
      }
    },
    { $unwind: "$tag" }
  );

  /**
   * -------------------------------------
   * 6️⃣ SORT (closest first)
   * -------------------------------------
   */
  pipeline.push({ $sort: { distance: 1 } });

  /**
   * -------------------------------------
   * 7️⃣ GROUP BY TAG
   * -------------------------------------
   */
  pipeline.push({
    $group: {
      _id: "$tag._id",
      title: { $first: "$tag.title" },

      objects: {
        $push: {
          _id: "$_id",
          basicInfo: "$basicInfo",

          venue: {
            venueType: { $ifNull: ["$primaryVenue.venueType", []] }
          },

          tags: [
            {
              _id: "$tag._id",
              title: "$tag.title"
            }
          ],

          type: { $literal: "Organizations" }
        }
      }
    }
  });

  /**
   * -------------------------------------
   * 8️⃣ LIMIT PER TAG
   * -------------------------------------
   */
  pipeline.push({
    $project: {
      _id: 0,
      title: 1,
      objects: { $slice: ["$objects", limitPerTag] }
    }
  });

  return Organizations.aggregate(pipeline).allowDiskUse(true);
};




module.exports = {
  getOrganizationMenuWithItems,
  findEventsByOrganization,
  countEventsByOrganization,
  getRecommendedOrganizations,
  findOrganizationById,
  findOrganizations,
  countOrganizations,
  updateMany,
  getNearbyOrganizations,
  findOrganizationWithSelectFilter,
  getSuggestedLoyaltyClubsForUser,
  getOrgCompanyOrganizer,
  getOrganizationsGroupedByVenueTypesRepo,
  getForYouOrganizationsForHomeRepo,
  getTrendingOrganizationsForHomeRepo,
  getSuggestedLoyaltyClubsForHome,
  getNewlyListedOrganizationsRepo,
  getOrganizationsGroupedByTagsRepo

};
