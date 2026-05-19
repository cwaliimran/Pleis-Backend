const { buildKeywordQueryFromModels } = require("@dbUtils/queryUtil");
const repository = require("./promotionsRepository");
const { generateMeta } = require("@utils/responseUtil");
const formatPromotion = require("./utils/formatPromotion");
const { cache, invalidate } = require("@redisCache");
const { GlobalBasePromotion } = require("../../../commonModules/globalLoyalty/promotions/models/Promotion");
const { generateImmediatelyForGlobalPromotionTemplate } = require("./utils/recurringPromotion.core");
const ACTIVE_GLOBAL_LOYALTY_PROMOTIONS_CACHE_KEY = "globalLoyaltyPromotions:active";

const create = async (data, timezone) => {
  let promotion = await repository.create(data);
  if (promotion?.recurringMeta?.isTemplate) {
    await generateImmediatelyForGlobalPromotionTemplate(promotion._id);
  }
  return formatPromotion(promotion, timezone);
};

const get = async ({ page, limit, keyword, status, date, timezone, sortBy, sortOrder }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const query = {
  };

  query.$or = [
    { "recurringMeta.isTemplate": false },
    { "recurringMeta.isTemplate": { $exists: false } }
  ];

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
  const records = await repository.getWithFilters(query, skip, limit, keyword, sortBy, sortOrder);



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

const update = async (id, data, scope = "single") => {
  const item = await repository.findById(id);
  if (!item) return null;
console.log("data",data );
  const { recurringMeta } = item;

  // ❌ Never mutate recurrence on single instance
  if (scope === "single" && data.recurringDetails) {
    delete data.recurringDetails;
  }

  // NON-RECURRING
  if (!recurringMeta || !recurringMeta.parentPromotion) {
    Object.assign(item, data);
    await item.save();
    await invalidate(ACTIVE_GLOBAL_LOYALTY_PROMOTIONS_CACHE_KEY);
    return await getDetails(id);
  }

  // SINGLE occurrence
  if (scope === "single") {
    Object.assign(item, data);
    await item.save();
    await invalidate(ACTIVE_GLOBAL_LOYALTY_PROMOTIONS_CACHE_KEY);
    return await getDetails(id);
  }

  // FUTURE occurrences
  const parentId = recurringMeta.parentPromotion;
  const index = recurringMeta.occurrenceIndex;

  await repository.updateMany(
    {
      "recurringMeta.parentPromotion": parentId,
      "recurringMeta.occurrenceIndex": { $gte: index },
      status: { $ne: "deleted" },
    },
    { $set: data }
  );

  await invalidate(ACTIVE_GLOBAL_LOYALTY_PROMOTIONS_CACHE_KEY);

  return await getDetails(id);
};

const deleteItem = async (id, scope = "single") => {
  const item = await repository.findById(id);
  if (!item) return null;

  const { recurringMeta } = item;

  // NON-RECURRING
  if (!recurringMeta || !recurringMeta.parentPromotion) {
    item.status = "deleted";
    await item.save();
    await invalidate(ACTIVE_GLOBAL_LOYALTY_PROMOTIONS_CACHE_KEY);
    return true;
  }

  // SINGLE occurrence
  if (scope === "single") {
    item.status = "deleted";
    await item.save();
    await invalidate(ACTIVE_GLOBAL_LOYALTY_PROMOTIONS_CACHE_KEY);
    return true;
  }

  // FUTURE occurrences
  const parentId = recurringMeta.parentPromotion;
  const index = recurringMeta.occurrenceIndex;

  await repository.updateMany(
    {
      "recurringMeta.parentPromotion": parentId,
      "recurringMeta.occurrenceIndex": { $gte: index },
    },
    { $set: { status: "deleted" } }
  );

  // also delete template
  await repository.updateOne(
    { _id: parentId },
    { $set: { status: "deleted" } }
  );

  await invalidate(ACTIVE_GLOBAL_LOYALTY_PROMOTIONS_CACHE_KEY);

  return true;
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
