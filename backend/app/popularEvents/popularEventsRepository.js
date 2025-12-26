const { default: mongoose } = require("mongoose");
const PopularEvents = require("../../admin/browserControl/popularEvents/PopularEvents");
const { getCurrentDateInTimezone, generateMeta } = require("../../helperUtils/responseUtil");

const getPopularEvents = async (
  page,
  limit,
  skip,
  userId,
  timezone,
  category,
  userLocation,          // <- either Point OR null
  radiusKm = 50
) => {

  const now = getCurrentDateInTimezone({ timezone });

  const dateFilter = {
    $or: [
      { "schedule.endDateTime": { $gte: now } },
      { "schedule.startDateTime": { $gte: now } },
    ],
  };

  const catObjId = category ? new mongoose.Types.ObjectId(category) : null;

  const categoryFilter = category
    ? { "basicInfo.categories": { $in: [catObjId] } }
    : {};

  // ---------------------------
  // GEO FILTER — ONLY WHEN NOT NULL
  // ---------------------------
  let geoFilter = {};

  if (userLocation) {
    const earthRadiusKm = 6378.1;
    const radiusInRadians = radiusKm / earthRadiusKm;

    geoFilter = {
      "basicInfo.venueLocation": {
        $geoWithin: {
          $centerSphere: [
            userLocation.coordinates,
            radiusInRadians,
          ],
        },
      },
    };
  }

  // ===========================
  // MAIN QUERY
  // ===========================
  const popularEvents = await PopularEvents.aggregate([
    { $match: { status: "active", isTop10: true } },

    {
      $lookup: {
        from: "events",
        localField: "event",
        foreignField: "_id",
        as: "event",
        pipeline: [
          {
            $match: {
              status: "active",
              ...dateFilter,
              ...categoryFilter,
              ...geoFilter,   // <- applied only when not null
            },
          },

          {
            $lookup: {
              from: "organizations",
              localField: "basicInfo.organization",
              foreignField: "_id",
              as: "organizationInfo",
              pipeline: [{ $project: { _id: 1, basicInfo: 1 } }],
            },
          },

          {
            $addFields: {
              "basicInfo.organization": {
                $arrayElemAt: ["$organizationInfo", 0],
              },
            },
          },

          {
            $lookup: {
              from: "favorites",
              let: { eventId: "$_id" },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ["$targetId", "$$eventId"] },
                        { $eq: ["$user", new mongoose.Types.ObjectId(userId)] },
                        { $eq: ["$targetType", "event"] },
                      ],
                    },
                  },
                },
                { $limit: 1 },
              ],
              as: "favoriteInfo",
            },
          },

          {
            $addFields: {
              isFavorite: { $gt: [{ $size: "$favoriteInfo" }, 0] },
            },
          },

          {
            $project: {
              _id: 1,
              basicInfo: 1,
              schedule: 1,
              isFavorite: 1,
            },
          },
        ],
      },
    },

    { $unwind: "$event" },
  ])
    .skip(skip)
    .limit(limit);

  // ===========================
  // COUNT (must mirror filters)
  // ===========================
  const countPipeline = [
    { $match: { status: "active", isTop10: true } },
    {
      $lookup: {
        from: "events",
        localField: "event",
        foreignField: "_id",
        as: "event",
        pipeline: [
          {
            $match: {
              status: "active",
              ...dateFilter,
              ...categoryFilter,
              ...geoFilter,
            },
          },
        ],
      },
    },
    { $unwind: "$event" },
    { $count: "total" },
  ];

  const countResult = await PopularEvents.aggregate(countPipeline);
  const totalTopPromos = countResult[0]?.total || 0;

  const meta = generateMeta(page, limit, totalTopPromos);

  return { data: popularEvents, meta };
};



const getPopularEventsForHome = async (
  limit,
  skip,
  timezone,
  category,
  userLocation, 
  radiusKm = 50
) => {
  const now = getCurrentDateInTimezone({ timezone });

  const earthRadiusKm = 6378.1;
  const radiusInRadians = radiusKm / earthRadiusKm;

  const dateFilter = {
    $or: [
      { "schedule.endDateTime": { $gte: now } },
      { "schedule.startDateTime": { $gte: now } },
    ],
  };

  const catObjId = category ? new mongoose.Types.ObjectId(category) : null;

  const categoryFilter = category
    ? { "basicInfo.categories": { $in: [catObjId] } }
    : {};

  // base match for ALL events
  const eventMatch = {
    status: "active",
    ...dateFilter,
    ...categoryFilter,
  };

  // 👉 only add geo filter when NOT null
  if (userLocation) {
    eventMatch["basicInfo.venueLocation"] = {
      $geoWithin: {
        $centerSphere: [userLocation.coordinates, radiusInRadians],
      },
    };
  }

  const data = await PopularEvents.aggregate([
    {
      $match: {
        status: "active",
        isTop10: true,
      },
    },

    {
      $lookup: {
        from: "events",
        localField: "event",
        foreignField: "_id",
        as: "event",
        pipeline: [
          { $match: eventMatch },

          {
            $lookup: {
              from: "organizations",
              localField: "basicInfo.organization",
              foreignField: "_id",
              as: "organization",
              pipeline: [
                {
                  $project: {
                    _id: 1,
                    "basicInfo.name": 1,
                    "basicInfo.media.logo": 1,
                  },
                },
              ],
            },
          },

          {
            $addFields: {
              "basicInfo.organization": {
                $arrayElemAt: ["$organization", 0],
              },
            },
          },

          {
            $project: {
              basicInfo: {
                media: "$basicInfo.media",
                title: "$basicInfo.title",
                description: "$basicInfo.description",
                organization: "$basicInfo.organization",
              },
              schedule: 1,
            },
          },
        ],
      },
    },

    { $unwind: "$event" },
    { $replaceRoot: { newRoot: "$event" } },
    { $skip: skip },
    { $limit: limit },
  ]);

  return { data };
};





module.exports = {
  getPopularEvents,
  getPopularEventsForHome,
};