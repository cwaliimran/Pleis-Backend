const {
  Challenge,
} = require("../../../commonModules/loyalty/challenges/models/Challenge");
const { default: mongoose } = require("mongoose");


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

const getChallengesByCompanyOrganizer = async ({
  skip,
  limit,
  companyOrganizer,
  now,
}) => {
  const match = {
    status: "active",
    companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
    endDate: { $gte: now }
  };

  return Challenge.find(match)
    .populate({
      path: "companyOrganizer",
      select: "companyDetails.name firstName profileIcon",
    })
    .populate("taskMenuItem")
    .populate("reward.rewardMenuItem")
    .populate("tierLimit")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit).lean().exec();
};

module.exports = {
  getChallengesWithFilters,
  countChallenges,
  findChallengeById,
  getChallengesByCompanyOrganizer
};
