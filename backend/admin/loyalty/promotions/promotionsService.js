const { buildKeywordQueryFromModels } = require("@dbUtils/queryUtil");
const Promotion = require("@PromotionModel");
const repository = require("./promotionsRepository");
const mongoose = require("mongoose");
const { generateMeta } = require("@utils/responseUtil");
const formatPromotion = require("./utils/formatPromotion");
const {
  generateImmediatelyForPromotionTemplate,
} = require("./utils/recurringPromotion.core");
const {
  getRewardById,
} = require("../../../app/loyalty/rewards/rewardsRepository");
const {
  resolvePromotionTimes,
} = require("../../../commonModules/loyalty/promotions/utils/promotionSchedule");
const create = async (data, timezone) => {
  const promotion = await repository.create(data);

  if (promotion?.recurringMeta?.isTemplate) {
    await generateImmediatelyForPromotionTemplate(promotion._id);
  }

  return formatPromotion(promotion, timezone);
};
const get = async ({
  companyOrganizer,
  page,
  limit,
  keyword,
  status,
  startDate,
  endDate,
  promotionType,
  timezone,
  sortBy,
  sortOrder,
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const query = {};

  // ✅ EXCLUDE TEMPLATES (CORRECT)
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

  if (startDate || endDate) {
    query.createdAt = {};

    if (startDate) {
      query.createdAt.$gte = new Date(startDate);
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setUTCDate(end.getUTCDate() + 1); // roll to start of next day
      query.createdAt.$lt = end;
    }
  }
  if (promotionType) {
    query.promotionType = promotionType;
  }

  if (keyword) {
    const keywordMatch = buildKeywordQueryFromModels(
      [{ schema: Promotion.schema }],
      keyword,
    );
    Object.assign(query, keywordMatch);
  }

  const records = await repository.getWithFilters(
    query,
    skip,
    limit,
    sortBy,
    sortOrder,
  );
  const totalFiltered = await repository.count(query);
  const metaDate = generateMeta(page, limit, totalFiltered);

  // ✅ COUNTS MUST ALSO EXCLUDE TEMPLATES
  const baseCountFilter = {
    ...(companyOrganizer && { companyOrganizer }),
    "recurringMeta.isTemplate": { $ne: true },
    status: { $ne: "deleted" },
  };

  // const meta = generateMeta(page, limit, totalFiltered);
  // meta.counts = { total, active, inactive };
  const data = records.data.map((r) => formatPromotion(r, timezone));

  const formatted = data;
  const meta = {
    ...metaDate,
    ...records.meta,
  };
  return { responses: formatted, meta };
};

const update = async (id, data, scope = "single", timezone) => {
  const promotion = await Promotion.findById(id);
  const reward = await getRewardById(data.reward);
  if (data.promotionType === "claimPromotion" && reward) {
    if (data.claimLimit > reward.claimLimit) {
      throw new Error("Promotion claim limit cannot exceed reward claim limit");
    }
  }

  if (!promotion) return null;

    if (data.startTime !== undefined || data.endTime !== undefined) {
      const times = resolvePromotionTimes(data, promotion);
      data.startTime = times.startTime;
      data.endTime = times.endTime;
    }

  const { recurringMeta } = promotion;

  // ❌ Never mutate recurrence on single instance
  if (scope === "single" && data.recurringDetails) {
    delete data.recurringDetails;
  }

  // NON-RECURRING
  if (!recurringMeta || !recurringMeta.parentPromotion) {
    Object.assign(promotion, data);
    await promotion.save();
    return await getDetails(id, timezone);
  }

  // SINGLE
  if (scope === "single") {
    Object.assign(promotion, data);
    await promotion.save();
    return await getDetails(id, timezone);
  }

  // FUTURE
  const parentId = recurringMeta.parentPromotion;
  const index = recurringMeta.occurrenceIndex;

  await Promotion.updateMany(
    {
      "recurringMeta.parentPromotion": parentId,
      "recurringMeta.occurrenceIndex": { $gte: index },
      status: { $ne: "deleted" },
    },
    { $set: data },
  );

  return await getDetails(id, timezone);
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
    { $set: { status: "deleted" } },
  );

  // Also kill template
  await Promotion.updateOne({ _id: parentId }, { $set: { status: "deleted" } });

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
