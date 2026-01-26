const { buildKeywordQueryFromModels } = require("@dbUtils/queryUtil");
const GlobalChallenge = require("@GlobalChallengeModel");
const challengeRepo = require("./challengesRepository");
const { generateMeta } = require("@utils/responseUtil");
const formatChallenge = require("../../../commonModules/loyalty/challenges/formatters/formatChallenge");
const { default: mongoose } = require("mongoose");
const { cache, invalidate } = require("@redisCache");
const ACTIVE_GLOBAL_LOYALTY_CHALLENGES_CACHE_KEY = "globalLoyaltyChallenges:active";
const buildGlobalLoyaltyChallengesCacheKey = ({
  scope = "public", // public | admin
  skip = 0,
  limit = 10
}) => {
  return `${ACTIVE_GLOBAL_LOYALTY_CHALLENGES_CACHE_KEY}:${scope}:skip=${skip}:limit=${limit}`;
};
const createChallenge = async (data) => {
  let challenge = await challengeRepo.createChallenge(data);
  return formatChallenge(challenge.toObject());
};

const getChallenges = async ({ page, limit, keyword, status, date, timezone }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  // Build query object
  const query = {};
  if (status) query.status = status;
  else query.status = { $ne: "deleted" };
  if (date) {
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    query.createdAt = { $gte: start, $lt: end };
  }
  if (keyword) {
    Object.assign(query, buildKeywordQueryFromModels([{ schema: GlobalChallenge.schema }], keyword));
  }

  // Get challenges with population
  const challenges = await challengeRepo.getChallengesWithFilters(query, skip, limit);

  // Get counts
  const [total, active, inactive, totalFiltered] = await Promise.all([
    GlobalChallenge.countDocuments({ status: { $ne: "deleted" } }),
    GlobalChallenge.countDocuments({ status: "active" }),
    GlobalChallenge.countDocuments({ status: "inactive" }),
    GlobalChallenge.countDocuments(query),
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
  await invalidate(ACTIVE_GLOBAL_LOYALTY_CHALLENGES_CACHE_KEY);
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
  updateChallenge,
  getChallengeDetails,
  deleteChallenge,
};