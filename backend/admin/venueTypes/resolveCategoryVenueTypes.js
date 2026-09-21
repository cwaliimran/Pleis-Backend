/**
 * Main carousel categories (Eat & Dining, Nightlife, …) are linked to VenueTypes
 * via VenueTypes.categories — NOT organization.otherInfo.categories.
 *
 * Home / search "category" filters must resolve to venue-type ids, then keep:
 *  - organizations whose primary venue has those types
 *  - events at venues with those types
 */
const mongoose = require("mongoose");
const VenueTypes = require("./VenueTypesModel");
const { cache } = require("@redisCache");

const toObjectId = (id) => {
  if (!id) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (mongoose.Types.ObjectId.isValid(id)) {
    return new mongoose.Types.ObjectId(id);
  }
  return null;
};

/**
 * @param {string|import('mongoose').Types.ObjectId|Array} categoryIds
 * @returns {Promise<import('mongoose').Types.ObjectId[]>}
 */
async function getVenueTypeObjectIdsForMainCategories(categoryIds) {
  const list = (Array.isArray(categoryIds) ? categoryIds : [categoryIds])
    .map(toObjectId)
    .filter(Boolean);

  if (!list.length) return [];

  const key = list
    .map((id) => String(id))
    .sort()
    .join(",");

  const ids = await cache({
    namespace: "venueTypes:by-main-category",
    params: { cat: key },
    ttl: 300,
    memoryTtl: 60,
    deferStore: true,
    fetchFn: async () => {
      const rows = await VenueTypes.find({
        status: "active",
        categories: { $in: list },
      })
        .select("_id")
        .lean();
      return (rows || []).map((r) => String(r._id));
    },
  });

  return (ids || [])
    .map(toObjectId)
    .filter(Boolean);
}

/**
 * Aggregation stages: require primary active venue with venueType ∈ venueTypeIds.
 * Safe to append after a $match / $geoNear on organizations.
 */
function primaryVenueTypeMatchStages(venueTypeIds = []) {
  const ids = (venueTypeIds || []).map(toObjectId).filter(Boolean);
  if (!ids.length) {
    // Force empty result set when category has no linked venue types
    return [{ $match: { _id: { $in: [] } } }];
  }

  return [
    {
      $lookup: {
        from: "venues",
        let: { orgId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$organization", "$$orgId"] },
              isPrimary: true,
              status: "active",
              venueType: { $in: ids },
            },
          },
          { $project: { _id: 1 } },
        ],
        as: "_mainCatVenues",
      },
    },
    {
      $match: {
        $expr: { $gt: [{ $size: "$_mainCatVenues" }, 0] },
      },
    },
    { $project: { _mainCatVenues: 0 } },
  ];
}

/**
 * Aggregation stages for events: venue.venueType intersects venueTypeIds.
 */
function eventVenueTypeMatchStages(venueTypeIds = []) {
  const ids = (venueTypeIds || []).map(toObjectId).filter(Boolean);
  if (!ids.length) {
    return [{ $match: { _id: { $in: [] } } }];
  }

  return [
    {
      $lookup: {
        from: "venues",
        localField: "basicInfo.venue",
        foreignField: "_id",
        pipeline: [
          {
            $match: {
              status: "active",
              venueType: { $in: ids },
            },
          },
          { $project: { _id: 1 } },
        ],
        as: "_mainCatEventVenues",
      },
    },
    {
      $match: {
        $expr: { $gt: [{ $size: "$_mainCatEventVenues" }, 0] },
      },
    },
    { $project: { _mainCatEventVenues: 0 } },
  ];
}

module.exports = {
  getVenueTypeObjectIdsForMainCategories,
  primaryVenueTypeMatchStages,
  eventVenueTypeMatchStages,
  toObjectId,
};
