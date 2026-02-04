const { buildKeywordQueryFromModels } = require("@dbUtils/queryUtil");
const repository = require("./promotionsRepository");
const { generateMeta } = require("@utils/responseUtil");
const formatPromotion = require("./utils/formatPromotion");
const { cache, invalidate } = require("@redisCache");
const { GlobalBasePromotion } = require("../../../commonModules/globalLoyalty/promotions/models/Promotion");
const ACTIVE_GLOBAL_LOYALTY_PROMOTIONS_CACHE_KEY = "globalLoyaltyPromotions:active";
 
const create = async (data,timezone) => {
  let promotion = await repository.create(data);
  return formatPromotion(promotion, timezone);
};

const get = async ({ page, limit, keyword, status, date, timezone }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const query = {
  };


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
    const keywordMatch = buildKeywordQueryFromModels([{ schema: GlobalBasePromotion.schema }], keyword);
    Object.assign(query, keywordMatch);
  }

  // Use repository function to get promotions with population
  const records = await repository.getWithFilters(query, skip, limit,keyword);



  // Get total counts
  const [total, active, inactive, totalFiltered] = await Promise.all([
    GlobalBasePromotion.countDocuments({ status: { $ne: "deleted" } }),
    GlobalBasePromotion.countDocuments({ status: "active" }),
    GlobalBasePromotion.countDocuments({ status: "inactive" }),
    GlobalBasePromotion.countDocuments(query),
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
  await invalidate(ACTIVE_GLOBAL_LOYALTY_PROMOTIONS_CACHE_KEY);
  //fetch updated item and return
  return await getDetails(id);
};

const deleteItem = async (id) => {
  const updated = await repository.findByIdAndUpdate(id, { status: "deleted" });
  await invalidate(ACTIVE_GLOBAL_LOYALTY_PROMOTIONS_CACHE_KEY); 
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
