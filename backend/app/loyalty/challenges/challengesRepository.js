const {
  Challenge,
} = require("../../../commonModules/loyalty/challenges/models/Challenge");


// Get challenges with population
const getChallengesWithFilters = async (query = {}, skip = 0, limit = 10) => {
  return Challenge.find(query)
    .populate("taskMenuItem")
    .populate("reward.rewardMenuItem")
    .populate("tierLimit")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
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

module.exports = {
  getChallengesWithFilters,
  countChallenges,
  findChallengeById,
};
