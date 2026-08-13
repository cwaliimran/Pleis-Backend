const { buildKeywordQueryFromModels } = require("@dbUtils/queryUtil");
const Challenge = require("@ChallengeModel");
const challengeRepo = require("./challengesRepository");
const { generateMeta } = require("@utils/responseUtil");
const formatChallenge = require("../../../commonModules/loyalty/challenges/formatters/formatChallenge");
const { default: mongoose } = require("mongoose");

const createChallenge = async (data) => {
  let challenge = await challengeRepo.createChallenge(data);
  return formatChallenge(challenge.toObject());
};

const getChallenges = async ({ companyOrganizer, page, limit, keyword, status, date, timezone, sortBy, sortOrder }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  // Build query object
  const query = {
    companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
  };
  if (status) query.status = status;
  else query.status = { $ne: "deleted" };
  if (date) {
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    query.createdAt = { $gte: start, $lt: end };
  }
  if (keyword) {
    Object.assign(query, buildKeywordQueryFromModels([{ schema: Challenge.schema }], keyword));
  }

  // Get challenges with population
  const challenges = await challengeRepo.getChallengesWithFilters(query, skip, limit, sortBy, sortOrder);

  // Get counts
  const [total, active, inactive, totalFiltered] = await Promise.all([
    Challenge.countDocuments({ ...(companyOrganizer && { companyOrganizer }), status: { $ne: "deleted" } }),
    Challenge.countDocuments({ status: "active", ...(companyOrganizer && { companyOrganizer }) }),
    Challenge.countDocuments({ status: "inactive", ...(companyOrganizer && { companyOrganizer }) }),
    Challenge.countDocuments(query),
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.challengesCount = { total, active, inactive };
  const formattedChallenges = challenges.map(challenge => formatChallenge(challenge, timezone));

  return { challenges: formattedChallenges, meta };
};
const getChallengesV2 = async ({
  companyOrganizer,
  page,
  limit,
  keyword,
  status,
  date,
  timezone,
  sortBy,
  sortOrder,
  rewardType,
  taskType,
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  // Build query object
  const query = {
    companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
  };
  if (status) query.status = status;
  else query.status = { $ne: "deleted" };
  if (date) {
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    query.createdAt = { $gte: start, $lt: end };
  }
  if (rewardType) query.rewardType = rewardType;
  if (taskType) query.taskType = taskType;
  if (keyword) {
    Object.assign(
      query,
      buildKeywordQueryFromModels([{ schema: Challenge.schema }], keyword),
    );
  }

  // Get challenges with population
  const challenges = await challengeRepo.getChallengesWithFilters(
    query,
    skip,
    limit,
    sortBy,
    sortOrder,
  );

  // Get counts
  // Get counts
  const [totalFiltered, statsAgg] = await Promise.all([
    Challenge.countDocuments(query),
    Challenge.aggregate([
      {
        $match: {
          ...(companyOrganizer && { companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer) }),
          status: { $ne: "deleted" },
        },
      },
      { $project: { _id: 1, title: 1 } },

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
              },
            },
          ],
          as: "orderStats",
        },
      },

      {
        $addFields: {
          views: { $ifNull: [{ $arrayElemAt: ["$viewsArr.count", 0] }, 0] },
          favorites: {
            $ifNull: [{ $arrayElemAt: ["$favoritesArr.count", 0] }, 0],
          },
          totalParticipants: {
            $ifNull: [
              { $arrayElemAt: ["$orderStats.totalParticipants", 0] },
              0,
            ],
          },
          completed: {
            $ifNull: [{ $arrayElemAt: ["$orderStats.completed", 0] }, 0],
          },
        },
      },

      { $sort: { completed: -1 } },

      {
        $group: {
          _id: null,
          totalViews: { $sum: "$views" },
          totalFavorites: { $sum: "$favorites" },
          totalParticipants: { $sum: "$totalParticipants" },
          totalCompletions: { $sum: "$completed" },
          mostCompletedChallenge: {
            $first: { title: "$title", completed: "$completed" },
          },
        },
      },
    ]),
  ]);

  const stats = statsAgg?.[0];
  const totalViews = stats?.totalViews || 0;
  const totalFavorites = stats?.totalFavorites || 0;
  const totalParticipants = stats?.totalParticipants || 0;
  const totalCompletions = stats?.totalCompletions || 0;
  const mostCompletedChallenge =
    stats?.mostCompletedChallenge?.completed > 0
      ? {
          name: stats.mostCompletedChallenge.title,
          count: stats.mostCompletedChallenge.completed,
        }
      : { name: null, count: 0 };

  const meta = generateMeta(page, limit, totalFiltered);
  meta.stats = { totalViews, totalFavorites, totalParticipants, totalCompletions, mostCompletedChallenge };
  const formattedChallenges = challenges.map((challenge) =>
    formatChallenge(challenge, timezone),
  );

  return { challenges: formattedChallenges, meta };
};;

const updateChallenge = async (id, data) => {
  const challenge = await challengeRepo.findChallengeById(id);
  if (!challenge) return null;
  Object.assign(challenge, data);
  await challenge.save();
  return formatChallenge(challenge.toObject());
};
const deleteChallenge = async (id) => {
  const updated = await challengeRepo.findByIdAndUpdate(id, { status: "deleted" });
  return !!updated;
};

const getChallengeDetails = async (id) => {
  return await challengeRepo.findChallengeById(id);
};

module.exports = {
  createChallenge,
  getChallenges,
  getChallengesV2,
  updateChallenge,
  getChallengeDetails,
  deleteChallenge,
};
