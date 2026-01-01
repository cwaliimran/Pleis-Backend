const Organizations = require("@OrganizationModel");
const Tags = require("@TagsModel");

const { generateMeta } = require("@utils/responseUtil");
const { getNearbyEventsWithAdvanceFilters } = require("../../events/eventService");
const mongoose = require("mongoose");
const { User } = require("@UserModel")

//
// EVENTS
//
async function searchEvents(ctx) {
  const { events, meta } = await getNearbyEventsWithAdvanceFilters(ctx);
  return { data: events, meta };
}

//
// ORGANIZATIONS
//
//
// ORGANIZATIONS
//
//
// ORGANIZATIONS (no primaryVenue)
//
async function searchOrganizations(ctx) {
  const {
    keyword,
    page,
    limit,
    latitude,
    longitude,
    sort,
    advanceFilters = {},
    timezone
  } = ctx;

  const {
    categories = [],
    tags = [],
    genre = [],
    distanceFrom = 0,
    distanceTo = 0,
  } = advanceFilters;

  const skip = (page - 1) * limit;

  const filter = { status: "active" };

  const toObjectIds = (arr) =>
    arr
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

  const categoryObjectIds = toObjectIds(categories);
  const tagObjectIds = toObjectIds(tags);

  //
  // TEXT SEARCH
  //
  if (keyword)
    filter["basicInfo.name"] = { $regex: keyword, $options: "i" };

  //
  // CATEGORY FILTER
  //
  if (categoryObjectIds.length)
    filter["otherInfo.categories"] = { $in: categoryObjectIds };

  //
  // TAG FILTER
  //
  if (tagObjectIds.length)
    filter["otherInfo.tags"] = { $in: tagObjectIds };

  //
  // GENRE FILTER
  //
  if (genre.length) {
    //make genre to new ObjectIds array
    const genreObjectIds = genre.filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));
    const genreTags = await Tags.find({
      status: "active",
      _id: { $in: genreObjectIds }
    }).select("_id");

    const genreTagIds = genreTags.map(t => t._id);

    if (!genreTagIds.length) {
      filter["otherInfo.tags"] = { $in: [] };
    } else {
      filter["otherInfo.tags"] = { $in: genreTagIds };
    }
  }

  const distanceToMeters = distanceTo * 1000;
  const distanceFromMeters = distanceFrom * 1000;

  //
  // GEO STAGE
  //
  const geoStage =
    latitude && longitude
      ? [
        {
          $geoNear: {
            near: { type: "Point", coordinates: [longitude, latitude] },
            key: "location",
            distanceField: "distance",
            spherical: true,
            query: filter,
            ...(distanceTo > 0 ? { maxDistance: distanceToMeters } : {}),
          }
        },
        ...(distanceFrom > 0
          ? [{ $match: { distance: { $gte: distanceFromMeters } } }]
          : [])
      ]
      : [{ $match: filter }];

  //
  // MAIN PIPELINE
  //
  const pipeline = [
    ...geoStage,

    //
    // SORT + PAGINATION
    //
    { $sort: { createdAt: sort === "asc" ? 1 : -1 } },
    { $skip: skip },
    { $limit: limit },

    //
    // POPULATE CATEGORIES (still inside otherInfo)
    //
    {
      $lookup: {
        from: "categories",
        localField: "otherInfo.categories",
        foreignField: "_id",
        pipeline: [{ $project: { _id: 1, title: 1 } }],
        as: "populatedCategories"
      }
    },

    {
      $addFields: {
        "otherInfo.categories": "$populatedCategories",
        timezone: timezone || null
      }
    },

    { $project: { populatedCategories: 0 } },

    //
    // FINAL FIELDS ONLY
    //
    {
      $project: {
        _id: 1,

        "basicInfo.name": 1,
        "basicInfo.media": 1,

        "otherInfo.categories": 1,
        operatingHours: 1,

        location: 1,
        distance: 1,

      }
    }
  ];

  //
  // COUNT PIPELINE
  //
  const countPipeline = [
    ...geoStage,
    { $count: "total" }
  ];

  const [items, totalAgg] = await Promise.all([
    Organizations.aggregate(pipeline),
    Organizations.aggregate(countPipeline)
  ]);

  const totalCount = totalAgg?.[0]?.total || 0;

  return {
    data: items,
    meta: generateMeta(page, limit, totalCount)
  };
}


// LOYALTY CLUBS — SEARCH (with keyword + real meta count)
async function searchLoyaltyClubs(ctx) {
  const {
    page,
    limit,
    latitude,
    longitude,
    keyword,
    advanceFilters = {}
  } = ctx;

  const {
    categories = [],
    tags = [],
    distanceFrom = 0,
    distanceTo = 0
  } = advanceFilters;

  const skip = (page - 1) * limit;

  const geoEnabled =
    typeof latitude === "number" &&
    !isNaN(latitude) &&
    typeof longitude === "number" &&
    !isNaN(longitude);

  const toObjectIds = arr =>
    arr
      .filter(id => mongoose.Types.ObjectId.isValid(id))
      .map(id => new mongoose.Types.ObjectId(id));

  const categoryObjectIds = toObjectIds(categories);
  const tagObjectIds = toObjectIds(tags);

  //
  // BASE MATCH FOR COMPANY
  //
  const baseMatch = {
    "accountState.status": "active",
    "accountState.userType": "organizer",
    "companyDetails.loyaltySettings.title": { $exists: true, $ne: "" },

    ...(keyword
      ? {
        "companyDetails.loyaltySettings.title": {
          $regex: keyword,
          $options: "i"
        }
      }
      : {})
  };

  //
  // BASE PIPELINE (shared)
  //
  const coreStages = [
    { $match: baseMatch },

    // Organizations under club
    {
      $lookup: {
        from: "organizations",
        localField: "_id",
        foreignField: "creator",
        as: "orgs",
        pipeline: [
          {
            $match: {
              status: "active",
              ...(categoryObjectIds.length
                ? { "otherInfo.categories": { $in: categoryObjectIds } }
                : {}),
              ...(tagObjectIds.length
                ? { "otherInfo.tags": { $in: tagObjectIds } }
                : {}),
              ...(keyword
                ? {
                  "basicInfo.name": {
                    $regex: keyword,
                    $options: "i"
                  }
                }
                : {})
            }
          }
        ]
      }
    },

    // must have at least one org
    {
      $addFields: {
        organizationsCount: { $size: "$orgs" }
      }
    },
    {
      $match: { organizationsCount: { $gt: 0 } }
    }
  ];

  //
  // GEO PIPELINE (optional)
  //
  const geoStages = [];

  if (geoEnabled) {
    geoStages.push(
      {
        $lookup: {
          from: "venues",
          let: { companyId: "$_id" },
          pipeline: [
            {
              $match: {
                status: "active",
                isPrimary: true
              }
            },
            {
              $lookup: {
                from: "organizations",
                localField: "organization",
                foreignField: "_id",
                as: "org",
                pipeline: [
                  {
                    $match: {
                      $expr: { $eq: ["$creator", "$$companyId"] }
                    }
                  }
                ]
              }
            },
            { $project: { location: 1 } }
          ],
          as: "venues"
        }
      },

      {
        $addFields: {
          venueLocation: { $first: "$venues.location" }
        }
      },

      {
        $addFields: {
          distance: {
            $cond: [
              { $ne: ["$venueLocation", null] },
              {
                $let: {
                  vars: {
                    lat1: { $arrayElemAt: ["$venueLocation.coordinates", 1] },
                    lon1: { $arrayElemAt: ["$venueLocation.coordinates", 0] },
                    lat2: latitude,
                    lon2: longitude
                  },
                  in: {
                    $multiply: [
                      6371000,
                      {
                        $acos: {
                          $add: [
                            {
                              $multiply: [
                                { $cos: { $degreesToRadians: "$$lat1" } },
                                { $cos: { $degreesToRadians: "$$lat2" } },
                                {
                                  $cos: {
                                    $degreesToRadians: {
                                      $subtract: ["$$lon2", "$$lon1"]
                                    }
                                  }
                                }
                              ]
                            },
                            {
                              $multiply: [
                                { $sin: { $degreesToRadians: "$$lat1" } },
                                { $sin: { $degreesToRadians: "$$lat2" } }
                              ]
                            }
                          ]
                        }
                      }
                    ]
                  }
                }
              },
              null
            ]
          }
        }
      },

      ...(distanceTo > 0
        ? [
          {
            $match: {
              $or: [
                { distance: null },
                { distance: { $lte: distanceTo * 1000 } }
              ]
            }
          }
        ]
        : []),

      ...(distanceFrom > 0
        ? [{ $match: { distance: { $gte: distanceFrom * 1000 } } }]
        : [])
    );
  }

  //
  // MAIN PIPELINE
  //
  const pipeline = [
    ...coreStages,
    ...geoStages,
    { $sort: { "companyDetails.loyaltySettings.title": 1 } },
    { $skip: skip },
    { $limit: limit },
    {
      $project: {
        _id: 1,
        companyDetails: {
          logo: 1,
          loyaltySettings: { title: 1 }
        },
        organizationsCount: 1,
        distance: geoEnabled ? 1 : null
      }
    }
  ];

  //
  // COUNT PIPELINE (NO SKIP/LIMIT)
  //
  const countPipeline = [
    ...coreStages,
    ...geoStages,
    { $count: "total" }
  ];

  const [data, totalAgg] = await Promise.all([
    User.aggregate(pipeline),
    User.aggregate(countPipeline)
  ]);

  const total = totalAgg?.[0]?.total || 0;

  return {
    data,
    meta: generateMeta(page, limit, total)
  };
}






module.exports = {
  searchEvents,
  searchOrganizations,
  searchLoyaltyClubs
};
