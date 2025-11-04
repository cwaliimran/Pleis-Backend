const { result } = require("lodash");
const { Events } = require("../../commonModules/events/Event");
const { Favorites } = require("../../commonModules/favorites/Favorite");
const Menus = require("../../commonModules/menuManagement/menu/Menus");
const Organizations = require("../../commonModules/organizations/Organization");
const mongoose = require("mongoose");
const Venues = require("../../commonModules/venues/Venues");
const { formatOrganization } = require("../../commonModules/organizations/formatter/formatOrganization");
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
    Venues.findOne({ organization: organizationId }).select("title floorPlan"),
  ]);

  let isFavorite = !!favorite;
  return orgProfile = {
    org,
    isFavorite,
    orgVenue
  };
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

module.exports = {
  getOrganizationMenuWithItems,
  findEventsByOrganization,
  countEventsByOrganization,
  getRecommendedOrganizations,
  findOrganizationById,
  findOrganizations,
  countOrganizations,
  updateMany,
};
