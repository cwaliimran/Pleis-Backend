const { buildKeywordQueryFromModels } = require("@dbUtils/queryUtil");
const { Challenge } = require("./models/Challenge");
const challengeRepo = require("./challengesRepository");
const mongoose = require("mongoose");
const { generateMeta } = require("@utils/responseUtil");
const formatChallenge = require("./utils/formatChallenge");

const createChallenge = async (data) => {
  return await challengeRepo.createChallenge(data);
};

const getChallenges = async ({ page, limit, keyword, status, userId, date, timezone }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const pipeline = [
    { $match: { ...(userId && { creator: new mongoose.Types.ObjectId(userId) }) } }
  ];

  if (status) {
    pipeline.push({ $match: { status } });
  } else {
    pipeline.push({ $match: { status: { $ne: "deleted" } } });
  }

  if (date) {
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    pipeline.push({
      $match: { createdAt: { $gte: start, $lt: end } }
    });
  }

  const keywordMatch = buildKeywordQueryFromModels([{ schema: Challenge.schema }], keyword);
  if (Object.keys(keywordMatch).length) {
    pipeline.push({ $match: keywordMatch });
  }

  pipeline.push({ $sort: { createdAt: -1 } });

  pipeline.push({
    $facet: {
      data: [{ $skip: skip }, ...(limit === 0 ? [] : [{ $limit: limit }])],
      totalFiltered: [{ $count: "count" }],
    },
  });

  const result = await Challenge.aggregate(pipeline);

  const challenges = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  const [total, active, inactive] = await Promise.all([
    Challenge.countDocuments({ ...(userId && { creator: userId }), status: { $ne: "deleted" } }),
    Challenge.countDocuments({ status: "active", ...(userId && { creator: userId }) }),
    Challenge.countDocuments({ status: "inactive", ...(userId && { creator: userId }) }),
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.challengesCount = { total, active, inactive };
  const formattedChallenges = challenges.map(challenge => formatChallenge(challenge, timezone));


  return { challenges: formattedChallenges, meta };
};

const updateChallenge = async (id, data) => {
  const challenge = await challengeRepo.findChallengeById(id);
  if (!challenge) return null;
  Object.assign(challenge, data);
  await challenge.save();
  return challenge;
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
  updateChallenge,
  getChallengeDetails,
  deleteChallenge,
};
