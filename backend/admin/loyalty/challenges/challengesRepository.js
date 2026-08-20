const {
  Challenge,
  VisitChallenge,
  EarnPointsChallenge,
  BuyMenuItemChallenge,
  ReferUsersChallenge,
} = require("../../../commonModules/loyalty/challenges/models/Challenge");

// Decide which discriminator model to use
const getModelByTaskType = (taskType) => {
  switch (taskType) {
    case "visit":
      return VisitChallenge;
    case "earnPoints":
      return EarnPointsChallenge;
    case "buyMenuItem":
      return BuyMenuItemChallenge;
    case "referUsers":
      return ReferUsersChallenge;
    default:
      return Challenge; // fallback
  }
};

// Create challenge
const createChallenge = async (data) => {
  try {
    const Model = getModelByTaskType(data.taskType);
    const challenge = new Model(data);
    await challenge.save();
    return challenge;
  } catch (err) {
    throw err;
  }
};

// Get challenges with population
const getChallengesWithFilters = async (
  query = {},
  skip = 0,
  limit = 10,
  sortBy = "createdAt",
  sortOrder = "desc",
) => {
  const sortDirection = sortOrder === "asc" ? 1 : -1;

  let sort = { createdAt: -1, _id: -1 };

  if (sortBy === "name") {
    sort = { title: sortDirection, _id: -1 };
  } else if (sortBy === "rewardType") {
    sort = { "reward.rewardType": sortDirection, _id: -1 };
  } else if (sortBy === "taskType") {
    sort = { taskType: sortDirection, _id: -1 };
  } else if (sortBy === "createdAt") {
    sort = { createdAt: sortDirection, _id: sortDirection };
  }

  const menuItemLookupPipeline = [
    {
      $lookup: {
        from: "menus",
        localField: "menu",
        foreignField: "_id",
        pipeline: [{ $project: { _id: 1, title: 1 } }],
        as: "menu",
      },
    },
    { $unwind: { path: "$menu", preserveNullAndEmptyArrays: true } },
    { $project: { _id: 1, title: 1, menu: 1 } },
  ];

  return Challenge.aggregate([
    { $match: query },

    {
      $lookup: {
        from: "menuitems",
        localField: "taskMenuItem",
        foreignField: "_id",
        as: "taskMenuItem",
        pipeline: menuItemLookupPipeline,
      },
    },
    {
      $lookup: {
        from: "menuitems",
        localField: "reward.rewardMenuItem",
        foreignField: "_id",
        as: "rewardMenuItemDocs",
        pipeline: menuItemLookupPipeline,
      },
    },
    {
      $addFields: {
        "reward.rewardMenuItem": "$rewardMenuItemDocs",
      },
    },

    {
      $lookup: {
        from: "tiers", // adjust to actual tierLimit collection name
        localField: "tierLimit",
        foreignField: "_id",
        as: "tierLimit",
        pipeline: [{ $project: { image: 1, title: 1 } }],
      },
    },
    { $unwind: { path: "$tierLimit", preserveNullAndEmptyArrays: true } },

    {
      $lookup: {
        from: "users",
        localField: "reward.specialTicket.companyOrganizer",
        foreignField: "_id",
        as: "reward.specialTicket.companyOrganizer",
        pipeline: [{ $project: { "companyDetails.name": 1 } }],
      },
    },
    {
      $unwind: {
        path: "$reward.specialTicket.companyOrganizer",
        preserveNullAndEmptyArrays: true,
      },
    },

    {
      $lookup: {
        from: "organizations",
        localField: "reward.specialTicket.organization",
        foreignField: "_id",
        as: "reward.specialTicket.organization",
        pipeline: [{ $project: { "basicInfo.name": 1 } }],
      },
    },
    {
      $unwind: {
        path: "$reward.specialTicket.organization",
        preserveNullAndEmptyArrays: true,
      },
    },

    {
      $lookup: {
        from: "tickets",
        localField: "reward.specialTicket.ticket",
        foreignField: "_id",
        as: "reward.specialTicket.ticket",
        pipeline: [{ $project: { title: 1 } }],
      },
    },
    {
      $unwind: {
        path: "$reward.specialTicket.ticket",
        preserveNullAndEmptyArrays: true,
      },
    },

    {
      $lookup: {
        from: "events",
        localField: "reward.specialTicket.event",
        foreignField: "_id",
        as: "reward.specialTicket.event",
        pipeline: [{ $project: { "basicInfo.title": 1 } }],
      },
    },
    {
      $unwind: {
        path: "$reward.specialTicket.event",
        preserveNullAndEmptyArrays: true,
      },
    },

    // views
    {
      $lookup: {
        from: "engagementevents",
        let: { challengeId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$entityType", "challenges"] },
                  { $eq: ["$entityId", "$$challengeId"] },
                  { $eq: ["$action", "view"] },
                ],
              },
            },
          },
          { $count: "count" },
        ],
        as: "viewsArr",
      },
    },

    // favorites
    {
      $lookup: {
        from: "favorites",
        let: { challengeId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$targetType", "challenge"] },
                  { $eq: ["$targetId", "$$challengeId"] },
                ],
              },
            },
          },
          { $count: "count" },
        ],
        as: "favoritesArr",
      },
    },

    // participants / completed / average progress
    {
      $lookup: {
        from: "loyaltychallengesorders",
        let: { challengeId: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$challenge", "$$challengeId"] } } },
          {
            $group: {
              _id: null,
              totalParticipants: { $sum: 1 },
              completed: {
                $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
              },
              avgProgress: {
                $avg: {
                  $cond: [
                    { $gt: ["$progress.target", 0] },
                    {
                      $multiply: [
                        { $divide: ["$progress.current", "$progress.target"] },
                        100,
                      ],
                    },
                    0,
                  ],
                },
              },
            },
          },
        ],
        as: "orderStats",
      },
    },

    // participants / completed / in-progress / expired / average progress
    {
      $lookup: {
        from: "loyaltychallengesorders",
        let: { challengeId: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$challenge", "$$challengeId"] } } },
          {
            $group: {
              _id: null,
              totalParticipants: { $sum: 1 },
              completed: {
                $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
              },
              inProgress: {
                $sum: { $cond: [{ $eq: ["$status", "in-progress"] }, 1, 0] },
              },
              expired: {
                $sum: { $cond: [{ $eq: ["$status", "expired"] }, 1, 0] },
              },
              avgProgress: {
                $avg: {
                  $cond: [
                    { $gt: ["$progress.target", 0] },
                    {
                      $multiply: [
                        { $divide: ["$progress.current", "$progress.target"] },
                        100,
                      ],
                    },
                    0,
                  ],
                },
              },
            },
          },
        ],
        as: "orderStats",
      },
    },

    {
      $addFields: {
        views: { $ifNull: [{ $arrayElemAt: ["$viewsArr.count", 0] }, 0] },
        favoritesCount: {
          $ifNull: [{ $arrayElemAt: ["$favoritesArr.count", 0] }, 0],
        },
        totalParticipants: {
          $ifNull: [{ $arrayElemAt: ["$orderStats.totalParticipants", 0] }, 0],
        },
        completed: {
          $ifNull: [{ $arrayElemAt: ["$orderStats.completed", 0] }, 0],
        },
        inProgress: {
          $ifNull: [{ $arrayElemAt: ["$orderStats.inProgress", 0] }, 0],
        },
        expired: { $ifNull: [{ $arrayElemAt: ["$orderStats.expired", 0] }, 0] },
        averageProgress: {
          $round: [
            { $ifNull: [{ $arrayElemAt: ["$orderStats.avgProgress", 0] }, 0] },
            2,
          ],
        },
      },
    },

    {
      $addFields: {
        // % of viewers who ended up participating
        participationRate: {
          $cond: [
            { $gt: ["$views", 0] },
            {
              $round: [
                {
                  $multiply: [
                    { $divide: ["$totalParticipants", "$views"] },
                    100,
                  ],
                },
                2,
              ],
            },
            0,
          ],
        },
        // % of participants who completed the challenge
        completionRate: {
          $cond: [
            { $gt: ["$totalParticipants", 0] },
            {
              $round: [
                {
                  $multiply: [
                    { $divide: ["$completed", "$totalParticipants"] },
                    100,
                  ],
                },
                2,
              ],
            },
            0,
          ],
        },
      },
    },

    {
      $project: {
        viewsArr: 0,
        favoritesArr: 0,
        orderStats: 0,
        rewardMenuItemDocs: 0,
      },
    },

    { $sort: sort },
    { $skip: skip },
    { $limit: limit },
  ]).collation({ locale: "en", strength: 2 });
};
// Count
const countChallenges = async (query = {}) => {
  return Challenge.countDocuments(query);
};

// Find by ID with population
const findChallengeById = async (id) => {
  return Challenge.findById(id)
    .populate("taskMenuItem")
    .populate("reward.rewardMenuItem")
    .populate("tierLimit");
};

// Update and save
const updateChallengeData = async (challenge, data) => {
  Object.assign(challenge, data);

  return await challenge.save();
};

// Delete
const deleteChallengeById = async (challenge) => {
  return await challenge.deleteOne();
};

// findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  return Challenge.findByIdAndUpdate(id, data, { new: true })
    .populate("taskMenuItem")
    .populate("reward.rewardMenuItem")
    .populate("tierLimit");
};

module.exports = {
  createChallenge,
  getChallengesWithFilters,
  countChallenges,
  findChallengeById,
  updateChallengeData,
  deleteChallengeById,
  findByIdAndUpdate,
};
