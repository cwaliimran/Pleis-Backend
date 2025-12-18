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

const findBestActiveChallengeByTaskType = async ({
  companyOrganizer,
  taskType
}) => {
  return Challenge.findOne({
    companyOrganizer,
    taskType,
    status: "active",
    endDate: { $gte: new Date() }
  })
    .sort({ taskValue: 1 }) // 👈 MINIMUM effort first
    .lean();
};

const getEligibleChallengesForDashboard = async ({
  clubIds,
  now
}) => {
  const organizerObjectIds = clubIds.map(id =>
    new mongoose.Types.ObjectId(id)
  );

  let challenges = await Challenge.find({
    companyOrganizer: { $in: organizerObjectIds },
    status: "active",
    endDate: { $gte: now }
  })
    .populate("tierLimit")
    .populate({
      path: "companyOrganizer",
      select: "companyDetails.loyaltySettings.title companyDetails.logo"
    })
    .lean();
  return challenges;
};

module.exports = {
  getChallengesWithFilters,
  countChallenges,
  findChallengeById,
  findBestActiveChallengeByTaskType,
  getEligibleChallengesForDashboard
};
