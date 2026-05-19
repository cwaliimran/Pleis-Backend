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
  sortOrder = "desc"
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

  return Challenge.find(query)
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
