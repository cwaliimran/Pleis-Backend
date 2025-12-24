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
const EngagementEvents = require("@EngagementEventsModel");


/**
 * Fetch one organization by ID (populated)
 */
const findOrganizationById = async (userId, organizationId) => {
  const [org, favorite, orgVenue] = await Promise.all([
    Organizations.findById(organizationId)
      .where({ status: "active" })
      .populate("otherInfo.categories")
      .populate("otherInfo.tags"),
    Favorites.exists({ user: userId, targetType: "organization", targetId: organizationId }),
    Venues.findOne({
      organization: organizationId,
      isPrimary: true
    }).select("title floorPlan venueType"),
  ]);

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
    cleanOrgVenue.venueTypeTitles = venueTypeTitles;  // Add venueTypeTitles to the clean 
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
const getOrganizationMenuWithItems = async (organizationId) => {
  if (!organizationId) return [];

  const orgObjId = new mongoose.Types.ObjectId(organizationId);

  const result = await Menus.aggregate([
    {
      $match: {
        organization: orgObjId,
        status: "active",
      },
    },
    {
      $lookup: {
        from: "menuitems",
        let: { menuId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$menu", "$$menuId"] },
              status: "active",
            },
          },
          { $sort: { createdAt: -1 } },
          { $limit: 10 },
          {
            $project: {
              title: 1,
              image: 1,
              description: 1,
              type: 1,
              basePrice: 1,
              discountPrice: 1,
              taxPercent: 1,
            },
          },
        ],
        as: "items",
      },
    },
    {
      $project: {
        title: 1,
        description: 1,
        status: 1,
        items: 1,
      },
    },
    { $sort: { createdAt: -1 } },
  ]);

  return result;
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

  // Step 2: Define weights (separated logic)
  const weights = getSimilarityWeights(options);

  // Step 3: Build aggregation
  const result = await Organizations.aggregate([
    {
      $match: {
        _id: { $ne: orgObjId },
        status: "active",
        $or: [
          { "otherInfo.tags": { $in: tags } },
          { "otherInfo.categories": { $in: categories } },
        ],
      },
    },
    {
      $addFields: {
        matchedTags: { $setIntersection: ["$otherInfo.tags", tags] },
        matchedCategories: { $setIntersection: ["$otherInfo.categories", categories] },
      },
    },
    {
      // Use weights dynamically here
      $addFields: {
        similarityScore: {
          $add: [
            { $multiply: [{ $size: "$matchedTags" }, weights.tagWeight] },
            { $multiply: [{ $size: "$matchedCategories" }, weights.categoryWeight] },
          ],
        },
      },
    },
    {
      $match: {
        similarityScore: { $gt: 0 },
      },
    },
    {
      $sort: { similarityScore: -1, createdAt: -1 },
    },
    { $limit: options.limit || 10 },
    {
      $lookup: {
        from: "categories",
        localField: "otherInfo.categories",
        foreignField: "_id",
        as: "otherInfo.categories",
        pipeline: [{ $project: { _id: 1, title: 1, image: 1 } }],
      },
    },
    {
      $lookup: {
        from: "tags",
        localField: "otherInfo.tags",
        foreignField: "_id",
        as: "otherInfo.tags",
        pipeline: [{ $project: { _id: 1, title: 1 } }],
      },
    },
    {
      $project: {
        _id: 1,
        "basicInfo.name": 1,
        "basicInfo.media": 1,
        "otherInfo.description": 1,
        "otherInfo.categories": 1,
        "otherInfo.tags": 1,
        similarityScore: 1,
      },
    },
  ]);

  return result.map((org) => formatOrganization(org));
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
  userId
}) => {
  const skip = (page - 1) * limit;

  let categoryObjectId = null;
  if (category) {
    categoryObjectId = new mongoose.Types.ObjectId(category);
  }

  const geoQuery = {
    status: "active",
  };

  // ✅ Category filter goes HERE
  if (categoryObjectId) {
    geoQuery["otherInfo.categories"] = { $in: [categoryObjectId] };
  }

  const pipeline = [
    {
      $geoNear: {
        near: userLocation,
        key: "location",
        distanceField: "distance",
        spherical: true,
        maxDistance: radiusKm * 1000,
        query: geoQuery,
      },
    },
    { $sort: { distance: 1 } },
    { $skip: skip },
    { $limit: limit },
    {
      $project: {
        _id: 1,
        creator: 1,
        "basicInfo.name": 1,
        "basicInfo.media": 1,
        distance: 1,
      },
    },
  ];

  let organizations = await Organizations.aggregate(pipeline);

  // Attach orderNumber (unchanged)
  if (userId) {
    const orgIds = organizations.map(org => org._id);

    const orders = await Orders.find({
      user: userId,
      organization: { $in: orgIds },
      status: { $in: ["pending", "confirmed"] },
    }).select("organization orderNumber").lean();

    const orgOrderMap = {};
    orders.forEach(order => {
      orgOrderMap[order.organization.toString()] = order.orderNumber;
    });

    organizations = organizations.map(org => ({
      ...org,
      orderNumber: orgOrderMap[org._id.toString()] || null,
    }));
  }

  return { organizations };
};


//get organization with custom .select filters
const findOrganizationWithSelectFilter = async (organizationId, selectFields) => {
  return Organizations.findById(organizationId)
    .where({ status: "active" })
    .select(selectFields).lean().exec();
};

//get suggested loyalty clubs
const getSuggestedLoyaltyClubsForUser = async ({ page = 1, limit = 10, userId, keyword }) => {
  const joinedClubs = await getUserJoinedClubs(userId);
  const joinedClubIds = joinedClubs.map(club => club.companyOrganizer.toString());
  const filter = {
    _id: { $nin: joinedClubIds },
    "accountState.status": "active",
    "accountState.userType": "organizer"
  };

  if (keyword) {
    filter["companyDetails.loyaltySettings.title"] = { $regex: keyword, $options: "i" };
  }

  let [result, count] = await Promise.all([
    User.find(filter).select("companyDetails.logo companyDetails.loyaltySettings.title").lean()
      .skip((page - 1) * limit)
      .limit(limit).lean(),
    User.countDocuments(filter)
  ]);

  let meta = generateMeta(page, limit, count || 0);

  return { result, meta };
};
//get suggested loyalty clubs for home api
const getSuggestedLoyaltyClubsForHome = async ({
  page = 1,
  limit = 10,
  userId,
  userLocation,
  radiusKm = 50
}) => {
  const joinedClubs = await getUserJoinedClubs(userId);
  const joinedClubIds = joinedClubs.map(c => c.companyOrganizer);

  /* 🔥 STEP 1: GEO FILTER */
  const nearbyCompanyIds = await getCompanyOrganizersWithinRadius({
    userLocation,
    radiusKm
  });

  if (!nearbyCompanyIds.length) return [];

  const skip = (page - 1) * limit;

  return User.aggregate([
    /* ===============================
       BASE FILTER (radius-aware)
       =============================== */
    {
      $match: {
        _id: {
          $in: nearbyCompanyIds,
          $nin: joinedClubIds
        },
        "accountState.status": "active",
        "accountState.userType": "organizer",
        "companyDetails.loyaltySettings.title": { $exists: true, $ne: "" }
      }
    },

    /* ===============================
       MEMBERS
       =============================== */
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

    /* ===============================
       ORGANIZATIONS (relevance)
       =============================== */
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

    /* ===============================
       POPULARITY (company views)
       =============================== */
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

    /* ===============================
       SCORING
       =============================== */
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
    },

    { $sort: { finalScore: -1 } },
    { $skip: skip },
    { $limit: limit },

    /* ===============================
       FINAL RESPONSE
       =============================== */
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
  ]);
};



const getCompanyOrganizersWithinRadius = async ({
  userLocation,
  radiusKm = 50
}) => {
  if (!userLocation?.coordinates?.length) return [];

  const result = await Organizations.aggregate([
    {
      $geoNear: {
        near: userLocation,
        key: "location",
        distanceField: "distance",
        spherical: true,
        maxDistance: radiusKm * 1000,
        query: {
          status: "active",
          "location.coordinates": { $exists: true }
        }
      }
    },

    /* Only need company organizer */
    {
      $group: {
        _id: "$creator" // companyOrganizer
      }
    }
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
  limit = 10,
  skip = 0,
  userId
}) => {

  const userPreferences = await getUserInterestsIdsForRecommendation(userId);

  const userCategories = userPreferences?.categories || [];
  const userTags = userPreferences?.tags || [];

  const geoQuery = { status: "active" };

  if (category) {
    geoQuery["otherInfo.categories"] = {
      $in: [new mongoose.Types.ObjectId(category)]
    };
  }

  const pipeline = [
    // 1️⃣ GEO FILTER (MUST be first)
    {
      $geoNear: {
        near: userLocation,
        key: "location",
        distanceField: "distance",
        spherical: true,
        maxDistance: radiusKm * 1000,
        query: geoQuery
      }
    },

    // 2️⃣ Match categories + tags
    {
      $addFields: {
        matchedCategories: {
          $size: {
            $setIntersection: ["$otherInfo.categories", userCategories]
          }
        },
        matchedTags: {
          $size: {
            $setIntersection: ["$otherInfo.tags", userTags]
          }
        }
      }
    },

    // 3️⃣ Relevance score (raw)
    {
      $addFields: {
        relevanceScore: {
          $add: [
            {
              $multiply: [
                0.6,
                {
                  $cond: [
                    { $gt: [userCategories.length, 0] },
                    { $divide: ["$matchedCategories", userCategories.length] },
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
                    { $gt: [userTags.length, 0] },
                    { $divide: ["$matchedTags", userTags.length] },
                    0
                  ]
                }
              ]
            }
          ]
        }
      }
    },

    // 4️⃣ Popularity score from meta (raw)
    {
      $addFields: {
        popularityScore: {
          $add: [
            {
              $multiply: [
                0.6,
                { $ln: { $add: [1, { $ifNull: ["$meta.favoritesCount", 0] }] } }
              ]
            },
            {
              $multiply: [
                0.4,
                { $ln: { $add: [1, { $ifNull: ["$meta.viewsCount", 0] }] } }
              ]
            }
          ]
        }
      }
    },

    // 5️⃣ Round relevance & popularity
    {
      $addFields: {
        relevanceScore: { $round: ["$relevanceScore", 2] },
        popularityScore: { $round: ["$popularityScore", 2] }
      }
    },

    // 6️⃣ Final score (rounded)
    {
      $addFields: {
        finalScore: {
          $round: [
            {
              $add: [
                { $multiply: [0.7, "$relevanceScore"] },
                { $multiply: [0.3, "$popularityScore"] }
              ]
            },
            2
          ]
        }
      }
    },

    // 7️⃣ Sort by best match
    { $sort: { finalScore: -1 } },

    // 8️⃣ Pagination
    { $skip: skip },
    { $limit: limit },

    // 9️⃣ Populate categories
    {
      $lookup: {
        from: "categories",
        localField: "otherInfo.categories",
        foreignField: "_id",
        as: "categories",
        pipeline: [{ $project: { title: 1 } }]
      }
    },

    // 🔟 Populate tags
    {
      $lookup: {
        from: "tags",
        localField: "otherInfo.tags",
        foreignField: "_id",
        as: "tags",
        pipeline: [{ $project: { title: 1 } }]
      }
    },

    // 1️⃣1️⃣ Final projection
    {
      $project: {
        _id: 1,
        "basicInfo.name": 1,
        "basicInfo.media": 1,
        "otherInfo.description": 1,
        categories: 1,
        tags: 1,
        distance: 1,
        relevanceScore: 1,
        popularityScore: 1,
        finalScore: 1
      }
    }
  ];

  return Organizations.aggregate(pipeline);
};


const getTrendingOrganizationsForHomeRepo = async ({
  userLocation,
  radiusKm = 50,
  category = null,
  limit = 10
}) => {

  const now = Date.now();
  const last48h = new Date(now - 48 * 60 * 60 * 1000);
  const last7d = new Date(now - 7 * 24 * 60 * 60 * 1000);

  const categoryObjectId = category
    ? new mongoose.Types.ObjectId(category)
    : null;

  const pipeline = [
    // 1️⃣ GEO FIRST — REQUIRED BY MONGODB
    {
      $geoNear: {
        near: userLocation,
        key: "location",
        distanceField: "distance",
        spherical: true,
        maxDistance: radiusKm * 1000,
        query: {
          status: "active",
          ...(categoryObjectId && {
            "otherInfo.categories": { $in: [categoryObjectId] }
          })
        }
      }
    },

    // 2️⃣ Lookup engagement events (last 7d only)
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

    // 3️⃣ Flatten engagement stats
    {
      $addFields: {
        views7d: {
          $ifNull: [{ $arrayElemAt: ["$engagementStats.views7d", 0] }, 0]
        },
        views48h: {
          $ifNull: [{ $arrayElemAt: ["$engagementStats.views48h", 0] }, 0]
        }
      }
    },

    // 4️⃣ Trending score
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

    // 5️⃣ Sort by trending
    { $sort: { trendingScore: -1 } },

    // 6️⃣ Limit
    { $limit: limit },

    // 7️⃣ Final projection
    {
      $project: {
        _id: 1,
        "basicInfo.name": 1,
        "basicInfo.media": 1,
        "otherInfo.description": 1,
        distance: 1,
        views48h: 1,
        views7d: 1,
        trendingScore: 1
      }
    }
  ];

  return Organizations.aggregate(pipeline);
};


const getNewlyListedOrganizationsRepo = async ({
  category,
  userLocation,
  radiusKm = 50,
  page = 1,
  limit = 10,
  skip = 0
}) => {

  const geoQuery = { status: "active" };

  if (category) {
    geoQuery["otherInfo.categories"] = {
      $in: [new mongoose.Types.ObjectId(category)]
    };
  }

  const pipeline = [
    /* ===============================
       1️⃣ GEO FILTER (MUST be first)
       =============================== */
    {
      $geoNear: {
        near: userLocation,
        key: "location",
        distanceField: "distance",
        spherical: true,
        maxDistance: radiusKm * 1000,
        query: geoQuery
      }
    },

    /* ===============================
       2️⃣ AGE (days since created)
       =============================== */
    {
      $addFields: {
        ageDays: {
          $divide: [
            { $subtract: [new Date(), "$createdAt"] },
            1000 * 60 * 60 * 24
          ]
        }
      }
    },

    /* ===============================
       3️⃣ POPULARITY (any engagement)
       =============================== */
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
    },

    /* ===============================
       4️⃣ NORMALIZED SCORES
       =============================== */
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
            { $ln: { $add: [1, "$popularityCount"] } },
            2
          ]
        }
      }
    },

    /* ===============================
       5️⃣ FINAL WEIGHTED SCORE
       =============================== */
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
    },

    /* ===============================
       6️⃣ SORT + PAGINATION
       =============================== */
    { $sort: { finalScore: -1 } },
    { $skip: skip },
    { $limit: limit },

    /* ===============================
       7️⃣ Populate categories
       =============================== */
    {
      $lookup: {
        from: "categories",
        localField: "otherInfo.categories",
        foreignField: "_id",
        as: "categories",
        pipeline: [{ $project: { title: 1 } }]
      }
    },

    /* ===============================
       8️⃣ Populate tags
       =============================== */
    {
      $lookup: {
        from: "tags",
        localField: "otherInfo.tags",
        foreignField: "_id",
        as: "tags",
        pipeline: [{ $project: { title: 1 } }]
      }
    },

    /* ===============================
       9️⃣ FINAL PROJECTION
       =============================== */
    {
      $project: {
        _id: 1,
        createdAt: 1,
        distance: 1,
        "basicInfo.name": 1,
        "basicInfo.media": 1,
        "otherInfo.description": 1,
        categories: 1,
        tags: 1,

        /* explain / debug */
        explain: {
          ageDays: { $round: ["$ageDays", 1] },
          popularityCount: "$popularityCount",
          recencyScore: "$recencyScore",
          popularityScore: "$popularityScore",
          finalScore: "$finalScore"
        }
      }
    }
  ];

  return Organizations.aggregate(pipeline);
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

};
