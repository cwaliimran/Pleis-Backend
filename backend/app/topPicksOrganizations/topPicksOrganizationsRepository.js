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
    { $unwind: "$topPick" }
  );

  /* ===============================
     3️⃣ APPLY FILTERS
     =============================== */
  pipeline.push({
    $match: {
      ...query,
      "topPick.status": "active"
    }
  });

  /* ===============================
     4️⃣ SORT BY ORDER
     =============================== */
  pipeline.push({ $sort: { "topPick.order": 1 } });

  /* ===============================
     5️⃣ PAGINATION
     =============================== */
  pipeline.push(
    { $skip: skip },
    { $limit: limit }
  );

  /* ===============================
     6️⃣ CREATOR POPULATION
     =============================== */
  pipeline.push(
    {
      $lookup: {
        from: "users",
        localField: "creator",
        foreignField: "_id",
        as: "creator",
        pipeline: [
          {
            $project: {
              _id: 1,
              "companyDetails.logo": 1,
              "companyDetails.loyaltySettings.title": 1
            }
          }
        ]
      }
    },
    {
      $unwind: {
        path: "$creator",
        preserveNullAndEmptyArrays: true
      }
    }
  );

  /* ===============================
     7️⃣ PRIMARY VENUE
     =============================== */
  pipeline.push({
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
        { $project: { venueType: 1 } }
      ],
      as: "primaryVenue"
    }
  });

  /* ===============================
     8️⃣ VENUE TYPE POPULATION
     =============================== */
  pipeline.push({
    $lookup: {
      from: "venuetypes",
      localField: "primaryVenue.venueType",
      foreignField: "_id",
      as: "venueTypes",
      pipeline: [
        { $project: { _id: 1, title: 1 } }
      ]
    }
  });

  /* ===============================
     9️⃣ FINAL RESPONSE
     =============================== */
  pipeline.push({
    $project: {
      _id: 1,
      basicInfo: 1,
      otherInfo: 1,
      operatingHours: 1,
      location: 1,
      creator: 1,
      venue: {
        venueType: "$venueTypes"
      },
      ...(userLocation ? { distance: 1 } : {})
    }
  });


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
    pipeline.push({ $match: { status: "active" } });
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

  /* ===============================
     4️⃣ SORT
     =============================== */
  pipeline.push({ $sort: { "topPick.order": 1 } });

 /* ===============================
   5️⃣ CREATOR POPULATION (FIXED)
=============================== */
pipeline.push(
  {
    $lookup: {
      from: "users",
      let: { creatorId: "$creator" },
      pipeline: [
        {
          $match: {
            $expr: { $eq: ["$_id", "$$creatorId"] }
          }
        },
        {
          $project: {
            _id: 1,
            "companyDetails.logo": 1,
            "companyDetails.loyaltySettings.title": 1
          }
        }
      ],
      as: "creator"
    }
  },
  {
    $addFields: {
      creator: {
        $ifNull: [
          { $arrayElemAt: ["$creator", 0] },
          {
            _id: null,
            companyDetails: {
              logo: null,
              loyaltySettings: { title: null }
            }
          }
        ]
      }
    }
  }
);


  /* ===============================
     6️⃣ PRIMARY VENUE
     =============================== */
  pipeline.push({
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
        { $project: { venueType: 1 } },
      ],
      as: "primaryVenue",
    },
  });

  /* ===============================
     7️⃣ VENUE TYPE POPULATION
     =============================== */
  pipeline.push({
    $lookup: {
      from: "venuetypes",
      localField: "primaryVenue.venueType",
      foreignField: "_id",
      as: "venueTypes",
      pipeline: [{ $project: { _id: 1, title: 1 } }],
    },
  });

  /* ===============================
     8️⃣ TAGS
     =============================== */
  pipeline.push({
    $lookup: {
      from: "tags",
      localField: "otherInfo.tags",
      foreignField: "_id",
      as: "tags",
      pipeline: [{ $project: { _id: 1, title: 1 } }],
    },
  });

  /* ===============================
     9️⃣ PAGINATION
     =============================== */
  pipeline.push({ $skip: skip }, { $limit: limit });

  /* ===============================
     🔟 FINAL RESPONSE
     =============================== */
  pipeline.push({
    $project: {
      _id: 1,
      ...(userLocation ? { distance: 1 } : {}),
      "basicInfo.name": 1,
      "basicInfo.media": 1,
      "otherInfo.description": 1,
      tags: 1,
      creator: 1,
      venue: {
        venueType: "$venueTypes",
      },
    },
  });

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