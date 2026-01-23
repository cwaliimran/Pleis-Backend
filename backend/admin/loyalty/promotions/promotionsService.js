const { buildKeywordQueryFromModels } = require("@dbUtils/queryUtil");
const Promotion = require("@PromotionModel");
const repository = require("./promotionsRepository");
const mongoose = require("mongoose");
const { generateMeta } = require("@utils/responseUtil");
const formatPromotion = require("./utils/formatPromotion");
const { generateImmediatelyForPromotionTemplate } = require("./utils/recurringPromotion.core");

const create = async (data, timezone) => {
  const promotion = await repository.create(data);

  if (promotion?.recurringMeta?.isTemplate) {
    await generateImmediatelyForPromotionTemplate(promotion._id);
  }

  return formatPromotion(promotion, timezone);
};
const get = async ({ companyOrganizer, page, limit, keyword, status, date, timezone }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const query = {
  };

  query.$or = [
    { "recurringMeta.isTemplate": false },
    { "recurringMeta.isTemplate": { $exists: false } },
  ];

  if (companyOrganizer) {
    query.companyOrganizer = new mongoose.Types.ObjectId(companyOrganizer);
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
    Promotion.countDocuments({
      ...(companyOrganizer && { companyOrganizer }), status: { $ne: "deleted" },
      "recurringMeta.isTemplate": false
    }),
    Promotion.countDocuments({ status: "active", ...(companyOrganizer && { companyOrganizer }), "recurringMeta.isTemplate": false }),
    Promotion.countDocuments({ status: "inactive", ...(companyOrganizer && { companyOrganizer }), "recurringMeta.isTemplate": false }),
    Promotion.countDocuments(query),
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.counts = { total, active, inactive };
  const formatted = records.map(item => formatPromotion(item, timezone));

  return { responses: formatted, meta };
};

const update = async (id, data, scope = "single") => {
  const promotion = await Promotion.findById(id);
  if (!promotion) return null;

  const { recurringMeta } = promotion;

  // ---------------------------
  // NON-RECURRING
  // ---------------------------
  if (!recurringMeta || !recurringMeta.parentPromotion) {
    Object.assign(promotion, data);
    await promotion.save();
    return await getDetails(id);
  }

  // ---------------------------
  // SINGLE OCCURRENCE
  // ---------------------------
  if (scope === "single") {
    Object.assign(promotion, data);
    await promotion.save();
    return await getDetails(id);
  }

  // ---------------------------
  // FUTURE OCCURRENCES
  // ---------------------------
  const parentId = recurringMeta.parentPromotion;
  const occurrenceIndex = recurringMeta.occurrenceIndex;

  await Promotion.updateMany(
    {
      "recurringMeta.parentPromotion": parentId,
      "recurringMeta.occurrenceIndex": { $gte: occurrenceIndex },
      status: { $ne: "deleted" },
    },
    { $set: data }
  );

  return await getDetails(id);
};


const deleteItem = async (id, scope = "single") => {
  const promotion = await Promotion.findById(id);
  if (!promotion) return null;

  const { recurringMeta } = promotion;

  // Non-recurring
  if (!recurringMeta || !recurringMeta.parentPromotion) {
    promotion.status = "deleted";
    await promotion.save();
    return true;
  }

  if (scope === "single") {
    promotion.status = "deleted";
    await promotion.save();
    return true;
  }

  const parentId = recurringMeta.parentPromotion;
  const index = recurringMeta.occurrenceIndex;

  await Promotion.updateMany(
    {
      "recurringMeta.parentPromotion": parentId,
      "recurringMeta.occurrenceIndex": { $gte: index },
    },
    { $set: { status: "deleted" } }
  );

  // Also kill template
  await Promotion.updateOne(
    { _id: parentId },
    { $set: { status: "deleted" } }
  );

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
