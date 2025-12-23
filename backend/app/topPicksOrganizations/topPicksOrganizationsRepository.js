// repositories/topPicksOrganizationRepository.js
const TopPicksOrganizations = require("@TopPicksOrganizationsModel");
const Organizations = require("@OrganizationModel");


// Get all with filters
const getTopPicksOrganizationsWithFilters = async (
  query,
  skip,
  limit,
  userLocation,
  radiusKm = 50
) => {
  const pipeline = [
    // 1️⃣ Geo first (distance in meters)
    {
      $geoNear: {
        near: userLocation,
        key: "location",
        distanceField: "distance",
        spherical: true,
        maxDistance: radiusKm * 1000,
        query: { status: "active" },
      },
    },

    // 2️⃣ Join top picks metadata
    {
      $lookup: {
        from: "toppicksorganizations",
        localField: "_id",
        foreignField: "organization",
        as: "topPick",
      },
    },
    { $unwind: "$topPick" },

    // 3️⃣ Apply top-pick filters
    {
      $match: {
        ...query,
        "topPick.status": "active",
      },
    },

    // 4️⃣ Sort using topPick.order
    { $sort: { "topPick.order": 1 } },

    // 5️⃣ Pagination
    { $skip: skip },
    { $limit: limit },

    // 6️⃣ FINAL SHAPE — remove topPick completely
    {
      $project: {
        topPick: 0,     // ❌ remove it
        __v: 0,
      },
    },
  ];

  return Organizations.aggregate(pipeline);
};
const getTopPicksOrganizationsWithFiltersHomeRepo = async (
  query,
  skip,
  limit,
  userLocation,
  radiusKm = 50,
  categoryObjectId = null
) => {
  const pipeline = [
    // 1️⃣ GEO FIRST
    {
      $geoNear: {
        near: userLocation,
        key: "location",
        distanceField: "distance",
        spherical: true,
        maxDistance: radiusKm * 1000,
        query: { status: "active" },
      },
    },

    // 2️⃣ Join top picks
    {
      $lookup: {
        from: "toppicksorganizations",
        localField: "_id",
        foreignField: "organization",
        as: "topPick",
      },
    },
    { $unwind: "$topPick" },

    // 3️⃣ Base filters
    {
      $match: {
        ...query,
        "topPick.status": "active",
      },
    },
  ];

  // ✅ CATEGORY FILTER (correct $in usage)
  if (categoryObjectId) {
    pipeline.push({
      $match: {
        "otherInfo.categories": { $in: [categoryObjectId] },
      },
    });
  }

  pipeline.push(
    // 4️⃣ Sort
    { $sort: { "topPick.order": 1 } },

    // 5️⃣ Join categories (populate)
    {
      $lookup: {
        from: "categories",
        localField: "otherInfo.categories",
        foreignField: "_id",
        as: "categories",
        pipeline: [
          {
            $project: {
              _id: 1,
              title: 1,
              image: 1,
            },
          },
        ],
      },
    },

    // 6️⃣ Pagination
    { $skip: skip },
    { $limit: limit },

    // 7️⃣ Final projection
    {
      $project: {
        _id: 1,
        "basicInfo.name": 1,
        "basicInfo.media.cover": 1,
        "otherInfo.description": 1,
        categories: 1,
        distance: 1,
      },
    }
  );

  return Organizations.aggregate(pipeline);
};


// Count by condition
const countTopPicksOrganizations = async (query = {}) => {
  return TopPicksOrganizations.countDocuments(query);
};



module.exports = {
  getTopPicksOrganizationsWithFilters,
  getTopPicksOrganizationsWithFiltersHomeRepo,
  countTopPicksOrganizations,
};