const {
  Challenge,
  VisitChallenge,
  EarnPointsChallenge,
  BuyMenuItemChallenge,
  ReferUsersChallenge,
} = require("../../../commonModules/loyalty/challenges/models/Challenge");
const { cache, invalidate } = require("@redisCache");
const ACTIVE_LOYALTY_CHALLENGE_CACHE_KEY = "loyaltyChallenge:active";
const buildLoyaltyChallengeCacheKey = ({
  scope = "public", // public | admin
  skip = 0,
  limit = 10
}) => {
  return `${ACTIVE_LOYALTY_CHALLENGE_CACHE_KEY}:${scope}:skip=${skip}:limit=${limit}`;
};
 
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
    await invalidate(ACTIVE_LOYALTY_CHALLENGE_CACHE_KEY);
    return challenge;
  } catch (err) {
    throw err;
  }
};

// Get challenges with population
const getChallengesWithFilters = async (query = {}, skip = 0, limit = 10) => {
    const cacheKey = buildLoyaltyChallengeCacheKey({
    scope: "admin",
    skip,
    limit,
  });
  return cache({
    namespace: cacheKey,
    ttl: 86400, // 1 day
 
    fetchFn: async () => {
  return Challenge.find(query)
    .populate("taskMenuItem")
    .populate("reward.rewardMenuItem")
    .populate({
      path: "tierLimit",
      select: "image title"
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean()
    .exec();
  }
  });
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
  await invalidate(ACTIVE_LOYALTY_CHALLENGE_CACHE_KEY);
  return await challenge.save();
};

// Delete
const deleteChallengeById = async (challenge) => {
  await invalidate(ACTIVE_LOYALTY_CHALLENGE_CACHE_KEY);
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
