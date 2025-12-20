const { default: mongoose } = require("mongoose");
const PopularEvents = require("../../admin/browserControl/popularEvents/PopularEvents");
const { getCurrentDateInTimezone, generateMeta } = require("../../helperUtils/responseUtil");

const getPopularEvents = async (page, limit, skip, userId, timezone, category) => {
  // 🕐 Base time reference
  const now = getCurrentDateInTimezone({ timezone });

  let dateFilter = {};
  // show only active and upcoming
  dateFilter = {
    $or: [
      { "schedule.endDateTime": { $gte: now } },
      { "schedule.startDateTime": { $gte: now } },
    ],
  };

  // 🎯 Category filter
  const catObjId = category ? new mongoose.Types.ObjectId(category) : null;
  const categoryFilter = category
    ? {
      "basicInfo.categories": { $in: [catObjId] },
    }
    : {};

  // 🧩 Aggregation pipeline
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
              status: { $eq: "active" },
              ...dateFilter,
              ...categoryFilter,
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
              "basicInfo.organization": { $arrayElemAt: ["$organizationInfo", 0] },
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
              status: { $eq: "active" },
              ...dateFilter,
              ...categoryFilter
            }
          }
        ]
      }
    },
    { $unwind: "$event" },
    { $count: "total" }
  ];

  const countResult = await PopularEvents.aggregate(countPipeline);
  const totalTopPromos = countResult[0]?.total || 0;

  let meta = generateMeta(page, limit, totalTopPromos);

  return { data: popularEvents, meta };
};

const getPopularEventsForHome = async (limit, skip, timezone, category) => {
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

  const data = await PopularEvents.aggregate([
    // 1️⃣ Only active Top Picks
    {
      $match: {
        status: "active",
        isTop10: true,
      },
    },

    // 2️⃣ Join Event
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
            },
          },

          // 3️⃣ Join organization (STRICT)
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

          // 4️⃣ HARD projection — ONLY what you asked
          {
            $project: {
              basicInfo: {
                media: "$basicInfo.media",
                title: "$basicInfo.title",
                description: "$basicInfo.description",
                organization: "$basicInfo.organization",
              },
            },
          },
        ],
      },
    },

    // 5️⃣ Remove empty joins
    { $unwind: "$event" },

    // 6️⃣ Flatten
    { $replaceRoot: { newRoot: "$event" } },

    // 7️⃣ Pagination
    { $skip: skip },
    { $limit: limit },
  ]);

  return { data };
};



module.exports = {
  getPopularEvents,
  getPopularEventsForHome,
};