const {
  Challenge,
} = require("../../../commonModules/loyalty/challenges/models/Challenge");
const { getActiveEndDateQuery } = require("../../../commonModules/loyalty/rewards/utils/rewardEndDate");
const { default: mongoose } = require("mongoose");


// Get challenges with population
const getChallengesWithFilters = async (query = {}, skip = 0, limit = 10) => {
  return Challenge.find(query)
    .populate("taskMenuItem")
    .populate("reward.rewardMenuItem")
    .populate("reward.specialTicket.ticket")
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
    .populate("reward.specialTicket.ticket")
    .populate("tierLimit")
    .lean();
};

const findBestActiveChallengeByTaskType = async ({
  companyOrganizer,
  taskType,
  timezone = "UTC",
}) => {
  return Challenge.findOne({
    companyOrganizer,
    taskType,
    status: "active",
    ...getActiveEndDateQuery(timezone),
  })
    .sort({ taskValue: 1 }) // 👈 MINIMUM effort first
    .lean();
};

const getEligibleChallengesForDashboard = async ({
  clubIds,
  timezone = "UTC",
}) => {
  const organizerObjectIds = clubIds.map(id =>
    new mongoose.Types.ObjectId(id)
  );

  let challenges = await Challenge.find({
    companyOrganizer: { $in: organizerObjectIds },
    status: "active",
    ...getActiveEndDateQuery(timezone),
  })
    .populate("tierLimit")
    .populate({
      path: "companyOrganizer",
      select: "companyDetails.loyaltySettings.title companyDetails.logo"
    })
    .populate("taskMenuItem")
    .populate("reward.rewardMenuItem")
    .populate("reward.specialTicket.ticket")
    .lean();
  return challenges;
};


// challengesRepo.js
const getChallengesWithPagination = async ({
  clubIds,
  skip,
  limit,
  keyword = "",
  timezone = "UTC",
}) => {
  const filters = [
    {
      companyOrganizer: { $in: clubIds },
      status: "active",
    },
    getActiveEndDateQuery(timezone),
  ];

  if (keyword) {
    filters.push({
      $or: [
        { title: { $regex: keyword, $options: "i" } },
        { description: { $regex: keyword, $options: "i" } },
      ],
    });
  }

  return Challenge.find({ $and: filters })
    .populate("tierLimit")
    .populate("companyOrganizer", "companyDetails")
    .populate("taskMenuItem")
    .populate("reward.rewardMenuItem")
    .populate("reward.specialTicket.ticket")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
};

const countChallengesWithPagination = async ({
  clubIds,
  keyword = "",
  timezone = "UTC",
}) => {
  const baseFilters = [
    {
      companyOrganizer: { $in: clubIds },
      status: "active",
    },
    getActiveEndDateQuery(timezone),
  ];

  if (keyword) {
    baseFilters.push({
      $or: [
        { title: { $regex: keyword, $options: "i" } },
        { description: { $regex: keyword, $options: "i" } },
      ],
    });
  }

  return Challenge.countDocuments({
    $and: baseFilters,
  });
};



module.exports = {
  getChallengesWithFilters,
  countChallenges,
  findChallengeById,
  findBestActiveChallengeByTaskType,
  getEligibleChallengesForDashboard,
  getChallengesWithPagination,
  countChallengesWithPagination,
};
