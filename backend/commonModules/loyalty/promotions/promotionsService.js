const { buildKeywordQueryFromModels } = require("@dbUtils/queryUtil");
const { Promotion } = require("./models/Promotion");
const repository = require("./promotionsRepository");
const mongoose = require("mongoose");
const { generateMeta } = require("@utils/responseUtil");
const formatPromotion = require("./utils/formatPromotion");

const create = async (data,timezone) => {
  let promotion = await repository.create(data);
  return formatPromotion(promotion, timezone);
};

const get = async ({ page, limit, keyword, status, userId, date, timezone }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const query = {};

  if (userId) {
    query.creator = userId;
  }

  if (status) {
    query.status = status;
  } else {
    query.status = { $ne: "deleted" };
  }

  if (date) {
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    query.createdAt = { $gte: start, $lt: end };
  }

  if (keyword) {
    const keywordMatch = buildKeywordQueryFromModels([{ schema: Promotion.schema }], keyword);
    Object.assign(query, keywordMatch);
  }

  // Use repository function to get promotions with population
  const records = await repository.getWithFilters(query, skip, limit);

  // Get total counts
  const [total, active, inactive, totalFiltered] = await Promise.all([
    Promotion.countDocuments({ ...(userId && { creator: userId }), status: { $ne: "deleted" } }),
    Promotion.countDocuments({ status: "active", ...(userId && { creator: userId }) }),
    Promotion.countDocuments({ status: "inactive", ...(userId && { creator: userId }) }),
    Promotion.countDocuments(query),
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.counts = { total, active, inactive };
  const formatted = records.map(item => formatPromotion(item, timezone));

  return { responses: formatted, meta };
};

const update = async (id, data) => {
  const item = await repository.findById(id);
  if (!item) return null;
  Object.assign(item, data);
  await item.save();
  //fetch updated item and return
  return await getDetails(id);
};

const deleteItem = async (id) => {
  const updated = await repository.findByIdAndUpdate(id, { status: "deleted" });
  return !!updated;
};

const getDetails = async (id, timezone) => {
  let item = await repository.findById(id);
  //format item
  if (item) {
    item = formatPromotion(item.toObject(), timezone);
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
