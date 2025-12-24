const GlobalRewardCategories = require("@GlobalRewardCategories");

const getCategoriesWithActiveRewards = async (skip, limit) => {
  const now = new Date();

  const pipeline = [
    {
      $lookup: {
        from: "globalrewards", // collection name
        localField: "_id",
        foreignField: "category",
        as: "rewards",
        pipeline: [
          {
            $match: {
              status: "active",
              $or: [
                { endDate: null },
                { endDate: { $gt: now } }
              ]
            }
          },
          { $limit: 1 } // only need existence
        ]
      }
    },

    // ✅ Keep only categories that HAVE rewards
    {
      $match: {
        "rewards.0": { $exists: true }
      }
    },

    // ✅ REMOVE rewards array from response
    {
      $project: {
        rewards: 0
      }
    },

    { $sort: { createdAt: -1 } },
    { $skip: skip },
    ...(limit === 0 ? [] : [{ $limit: limit }])
  ];

  return GlobalRewardCategories.aggregate(pipeline);
};

const countCategoriesWithActiveRewards = async () => {
  const now = new Date();

  const pipeline = [
    {
      $lookup: {
        from: "globalrewards",
        localField: "_id",
        foreignField: "category",
        as: "rewards",
        pipeline: [
          {
            $match: {
              status: "active",
              $or: [
                { endDate: null },
                { endDate: { $gt: now } }
              ]
            }
          },
          { $limit: 1 }
        ]
      }
    },
    {
      $match: {
        "rewards.0": { $exists: true }
      }
    },
    { $count: "total" }
  ];

  const result = await GlobalRewardCategories.aggregate(pipeline);
  return result[0]?.total || 0;
};

module.exports = {
  getCategoriesWithActiveRewards,
  countCategoriesWithActiveRewards,
};
