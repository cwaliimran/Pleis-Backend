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
  const pipeline = [];

  /* ===============================
     1️⃣ GEO OR GLOBAL
     =============================== */
  if (userLocation) {
    pipeline.push({
      $geoNear: {
        near: userLocation,
        key: "location",
        distanceField: "distance",
        spherical: true,
        maxDistance: radiusKm * 1000,
        query: { status: "active" }
      }
    });
  } else {
    // Global mode — no distance filtering
    pipeline.push({
      $match: { status: "active" }
    });
  }

  /* ===============================
     2️⃣ JOIN TOP PICKS
     =============================== */
  pipeline.push(
    {
      $lookup: {
        from: "toppicksorganizations",
        localField: "_id",
        foreignField: "organization",
        as: "topPick"
      }
    },
    { $unwind: "$topPick" },

    /* ===============================
       3️⃣ APPLY FILTERS
       =============================== */
    {
      $match: {
        ...query,
        "topPick.status": "active"
      }
    },

    /* ===============================
       4️⃣ SORT BY ORDER
       =============================== */
    { $sort: { "topPick.order": 1 } },

    /* ===============================
       5️⃣ PAGINATION
       =============================== */
    { $skip: skip },
    { $limit: limit },

    /* ===============================
       6️⃣ FINAL RESPONSE
       =============================== */
    {
      $project: {
        topPick: 0,
        __v: 0
      }
    }
  );

  return Organizations.aggregate(pipeline);
};

const getTopPicksOrganizationsWithFiltersHomeRepo = async (
  query,
  skip,
  limit,
  userLocation,          // may be null
  radiusKm = 50,
  categoryObjectId = null
) => {

  const pipeline = [];

  /* ===============================
     1️⃣ CONDITIONAL GEO
     =============================== */
  if (userLocation) {
    pipeline.push({
      $geoNear: {
        near: userLocation,
        key: "location",
        distanceField: "distance",
        spherical: true,
        maxDistance: radiusKm * 1000,
        query: { status: "active" },
      },
    });
  } else {
    // GLOBAL MODE
    pipeline.push({
      $match: { status: "active" },
    });
  }

  /* ===============================
     2️⃣ TOP PICKS JOIN
     =============================== */
  pipeline.push(
    {
      $lookup: {
        from: "toppicksorganizations",
        localField: "_id",
        foreignField: "organization",
        as: "topPick",
      },
    },
    { $unwind: "$topPick" },

    /* ===============================
       3️⃣ BASE FILTERS
       =============================== */
    {
      $addFields: {
        topPickStatus: "$topPick.status",
      },
    },
    {
      $match: {
        ...query,
        topPickStatus: "active",
      },
    }
  );

  /* ===============================
     OPTIONAL CATEGORY FILTER
     =============================== */
  if (categoryObjectId) {
    pipeline.push({
      $match: {
        "otherInfo.categories": { $in: [categoryObjectId] },
      },
    });
  }

  pipeline.push(
    /* ===============================
       4️⃣ SORT (ADMIN ORDER)
       =============================== */
    { $sort: { "topPick.order": 1 } },

    /* ===============================
       5️⃣ PRIMARY VENUE (TITLE ONLY)
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
              status: "active",
            },
          },
          { $project: { _id: 0, title: 1 } },
        ],
        as: "primaryVenue",
      },
    },

    /* ===============================
       6️⃣ TAGS (TITLE ONLY)
       =============================== */
    {
      $lookup: {
        from: "tags",
        localField: "otherInfo.tags",
        foreignField: "_id",
        as: "tags",
        pipeline: [{ $project: { _id: 1, title: 1 } }],
      },
    },

    /* ===============================
       7️⃣ PAGINATION
       =============================== */
    { $skip: skip },
    { $limit: limit },

    /* ===============================
       8️⃣ FINAL PROJECTION
       =============================== */
    {
      $project: {
        _id: 1,
        distance: userLocation ? 1 : null,   // only meaningful in geo mode
        "basicInfo.name": 1,
        "basicInfo.media.cover": 1,
        "otherInfo.description": 1,
        tags: 1,
        venue: {
          title: { $ifNull: [{ $first: "$primaryVenue.title" }, null] },
        },
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