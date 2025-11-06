const { buildKeywordQueryFromModels } = require("@dbUtils/queryUtil");
const { Challenge } = require("./models/Challenge");
const challengeRepo = require("./challengesRepository");
const { generateMeta } = require("@utils/responseUtil");
const formatChallenge = require("./utils/formatChallenge");

const createChallenge = async (data) => {
  return await challengeRepo.createChallenge(data);
};

const getChallenges = async ({ page, limit, keyword, status, userId, date, timezone }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  // Build query object
  const query = {};
  if (userId) query.creator = userId;
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
  const challenges = await challengeRepo.getChallengesWithFilters(query, skip, limit);

  // Get counts
  const [total, active, inactive, totalFiltered] = await Promise.all([
    Challenge.countDocuments({ ...(userId && { creator: userId }), status: { $ne: "deleted" } }),
    Challenge.countDocuments({ status: "active", ...(userId && { creator: userId }) }),
    Challenge.countDocuments({ status: "inactive", ...(userId && { creator: userId }) }),
    Challenge.countDocuments(query),
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
