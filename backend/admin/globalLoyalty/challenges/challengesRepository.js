const {
  GlobalChallenge,
  GlobalVisitChallenge,
  GlobalEarnPointsChallenge,
  GlobalBuyMenuItemChallenge,
  GlobalReferUsersChallenge,
} = require("../../../commonModules/globalLoyalty/rewards/models/Challenge/models/Challenge");
const { cache, invalidate } = require("@redisCache");
const ACTIVE_GLOBAL_LOYALTY_CHALLENGES_CACHE_KEY = "globalLoyaltyChallenges:active";
const buildGlobalLoyaltyChallengesCacheKey = ({
  scope = "public", // public | admin
  skip = 0,
  limit = 10,
  sortBy,
  sortOrder
}) => {
  return `${ACTIVE_GLOBAL_LOYALTY_CHALLENGES_CACHE_KEY}:${scope}:skip=${skip}:limit=${limit}:sortBy=${sortBy}:sortOrder=${sortOrder}`;
};
// Decide which discriminator model to use
const getModelByTaskType = (taskType) => {
  switch (taskType) {
    case "visit":
      return GlobalVisitChallenge;
    case "earnPoints":
      return GlobalEarnPointsChallenge;
    case "buyMenuItem":
      return GlobalBuyMenuItemChallenge;
    case "referUsers":
      return GlobalReferUsersChallenge;
    default:
      return GlobalChallenge; // fallback
  }
};

// Create challenge
const createChallenge = async (data) => {
  try {
    const Model = getModelByTaskType(data.taskType);
    const challenge = new Model(data);

    await challenge.save();
    await invalidate(ACTIVE_GLOBAL_LOYALTY_CHALLENGES_CACHE_KEY);
    return challenge;
  } catch (err) {
    throw err;
  }
};

// Get challenges with population
// const getChallengesWithFilters = async (query = {}, skip = 0, limit = 10,date,status,keyword, sortBy, sortOrder) => {
//     let cacheKey = buildGlobalLoyaltyChallengesCacheKey({
//     scope: "admin",
//     skip,
//     limit,
//     sortBy,
//     sortOrder
//   });
//   const filters = [];
//     if (keyword) filters.push(`keyword=${keyword}`);
//   if (status) filters.push(`status=${status}`);
//   if (date) filters.push(`date=${date}`);
//   if (filters.length > 0) {
//     cacheKey = `${cacheKey}:${filters.join(":")}`;
//   }
//   return cache({
//     namespace: cacheKey,
//     ttl: 86400, // 1 day

//     fetchFn: async () => {
//   return GlobalChallenge.find(query)
//     // Task-related
//     .populate("taskMenuItem")

//     // Tier
//     .populate({
//       path: "tierLimit",
//       select: "image title"
//     })

//     // 🎟️ Special Ticket Reward – nested population
//     .populate({
//       path: "reward.specialTicket.companyOrganizer",
//       select: "companyDetails.name"
//     })
//     .populate({
//       path: "reward.specialTicket.organization",
//       select: "basicInfo.name"
//     })
//     .populate({
//       path: "reward.specialTicket.ticket",
//       select: "title"
//     })
//     .populate({
//       path: "reward.specialTicket.event",
//       select: "basicInfo.title"
//     })

//     .sort({ createdAt: -1 })
//     .skip(skip)
//     .limit(limit)
//     .lean()
//     .exec();
//     },
//   });
// };

const getChallengesWithFilters = async (
  query = {},
  skip = 0,
  limit = 10,
  date,
  status,
  keyword,
  sortBy = "createdAt",
  sortOrder = "desc"
) => {
  let cacheKey = buildGlobalLoyaltyChallengesCacheKey({
    scope: "admin",
    skip,
    limit,
    sortBy,
    sortOrder,
  });

  const filters = [];
  if (keyword) filters.push(`keyword=${keyword}`);
  if (status) filters.push(`status=${status}`);
  if (date) filters.push(`date=${date}`);

  if (filters.length > 0) {
    cacheKey = `${cacheKey}:${filters.join(":")}`;
  }

  return cache({
    namespace: cacheKey,
    ttl: 86400,

    fetchFn: async () => {
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

      return GlobalChallenge.find(query)
        .populate("taskMenuItem")
        .populate({
          path: "tierLimit",
          select: "image title",
        })
        .populate({
          path: "reward.specialTicket.companyOrganizer",
          select: "companyDetails.name",
        })
        .populate({
          path: "reward.specialTicket.organization",
          select: "basicInfo.name",
        })
        .populate({
          path: "reward.specialTicket.ticket",
          select: "title",
        })
        .populate({
          path: "reward.specialTicket.event",
          select: "basicInfo.title",
        })
        .collation({ locale: "en", strength: 2 })
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean()
        .exec();
    },
  });
};


// Count
const countChallenges = async (query = {}) => {
  return GlobalChallenge.countDocuments(query);
};

// Find by ID with population
const findChallengeById = async (id) => {
  return GlobalChallenge.findById(id)
    .populate("taskMenuItem")
    .populate("reward.rewardMenuItem")
    .populate("tierLimit");
};

// Update and save
const updateChallengeData = async (challenge, data) => {
  Object.assign(GlobalChallenge, data);
  await invalidate(ACTIVE_GLOBAL_LOYALTY_CHALLENGES_CACHE_KEY);
  return await GlobalChallenge.save();
};

// Delete
const deleteChallengeById = async (challenge) => {
  await invalidate(ACTIVE_GLOBAL_LOYALTY_CHALLENGES_CACHE_KEY);
  return await GlobalChallenge.deleteOne();
};

// findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  await invalidate(ACTIVE_GLOBAL_LOYALTY_CHALLENGES_CACHE_KEY);
  return GlobalChallenge.findByIdAndUpdate(id, data, { new: true })
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
