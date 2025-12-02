const { buildKeywordQueryFromModels } = require("@dbUtils/queryUtil");
const repository = require("./rewardsRepository");
const mongoose = require("mongoose");
const { generateMeta } = require("@utils/responseUtil");
const formatData = require("./utils/formatReward");
const BaseReward = require("@GlobalLoyaltyReward");

const create = async (data) => {
  return await repository.create(data);
};

const get = async ({ page, limit, keyword, status, date, timezone }) => {
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
    const keywordMatch = buildKeywordQueryFromModels(
      [{ schema: BaseReward.schema }],
      keyword
    );
    Object.assign(query, keywordMatch);
  }

  // Fetch rewards
  const records = await repository.getWithFilters(query, skip, limit);

  // Filtered count
  const totalFiltered = await BaseReward.countDocuments(query);

  // Summary counts (companyOrganizer removed)
  const [total, active, inactive] = await Promise.all([
    BaseReward.countDocuments({ status: { $ne: "deleted" } }),
    BaseReward.countDocuments({ status: "active" }),
    BaseReward.countDocuments({ status: "inactive" }),
  ]);

  // Meta
  const meta = generateMeta(page, limit, totalFiltered);
  meta.counts = { total, active, inactive };

  // Format output
  const formatted = records.map(item => formatData(item, timezone));

  return { responses: formatted, meta };
};


const update = async (id, data) => {
  let item = await repository.findById(id);
  if (!item) return null;
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

module.exports = {
  create,
  get,
  update,
  getDetails,
  deleteItem,
};
