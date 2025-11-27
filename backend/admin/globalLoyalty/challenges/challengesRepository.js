const {
  GlobalChallenge,
  GlobalVisitChallenge,
  GlobalEarnPointsChallenge,
  GlobalBuyMenuItemChallenge,
  GlobalReferUsersChallenge,
} = require("../../../commonModules/globalLoyalty/rewards/models/Challenge/models/Challenge");

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
    return challenge;
  } catch (err) {
    throw err;
  }
};

// Get challenges with population
const getChallengesWithFilters = async (query = {}, skip = 0, limit = 10) => {
  return GlobalChallenge.find(query)
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
};

// Count
const countChallenges = async (query = {}) => {
  return GlobalChallenge.countDocuments(query);
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
  return await GlobalChallenge.deleteOne();
};

// findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
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
