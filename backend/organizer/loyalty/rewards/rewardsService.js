const { buildKeywordQueryFromModels } = require("@dbUtils/queryUtil");
const repository = require("./rewardsRepository");
const mongoose = require("mongoose");
const { generateMeta } = require("@utils/responseUtil");
const formatData = require("./utils/formatReward");
const { Reward } = require("../../../commonModules/loyalty/rewards/models");
const ACTIVE_LOYALTY_REWARDS_CACHE_KEY = "loyaltyRewards:active";
const buildLoyaltyRewardsCacheKey = ({
  user,
  skip = 0,
  limit = 10
}) => {
  return `${ACTIVE_LOYALTY_REWARDS_CACHE_KEY}:${user}:skip=${skip}:limit=${limit}`;
};
const invalidateLoyaltyRewardsCache = async () => {
  await invalidate(`${ACTIVE_LOYALTY_REWARDS_CACHE_KEY}:${user}`);
};
const create = async (data) => {
  return await repository.create(data);
};

const get = async ({ companyOrganizer, page, limit, keyword, status, date, timezone }) => {
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
    const keywordMatch = buildKeywordQueryFromModels([{ schema: Reward.schema }], keyword);
    Object.assign(query, keywordMatch);
  }

  // Get rewards with population
  const records = await repository.getWithFilters(query, skip, limit);

  const totalFiltered = await Reward.countDocuments(query);

  const [total, active, inactive] = await Promise.all([
    Reward.countDocuments({ ...(companyOrganizer && { companyOrganizer }), status: { $ne: "deleted" } }),
    Reward.countDocuments({ status: "active", ...(companyOrganizer && { companyOrganizer }) }),
    Reward.countDocuments({ status: "inactive", ...(companyOrganizer && { companyOrganizer }) }),
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.counts = { total, active, inactive };
  const formatted = records.map(item => formatData(item, timezone));

  return { responses: formatted, meta };
};

const update = async (id, data) => {
  let item = await repository.findById(id);

  if (!item) return null;
  await invalidateLoyaltyRewardsCache(item.companyOrganizer);
  Object.assign(item, data);
  await item.save();
  //fetch updated item and return
  item = await getDetails(id);
  return item;
};

const deleteItem = async (id) => {
  const updated = await repository.findByIdAndUpdate(id, { status: "deleted" });
  return !!updated;
};

const getDetails = async (id) => {
  let item = await repository.findById(id);
  //format item
  if (item) {
    item = formatData(item.toObject());
  }
  return item;
};

const redeemReward = async (bookingId, userId) => {
  return repository.redeemReward(bookingId, userId);
};


module.exports = {
  redeemReward,
  create,
  get,
  update,
  getDetails,
  deleteItem,
};
