const { buildKeywordQueryFromModels } = require("../../../helperUtils/queryUtil");
const { Promotion } = require("./models/Promotion");
const repository = require("./promotionRepository");
const mongoose = require("mongoose");
const { generateMeta } = require("../../../helperUtils/responseUtil");
const formatPromotion = require("./utils/formatPromotion");

const create = async (data) => {
  return await repository.create(data);
};

const get = async ({ page, limit, keyword, status, userId, date, timezone }) => {
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

  const keywordMatch = buildKeywordQueryFromModels([{ schema: Promotion.schema }], keyword);
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

  const result = await Promotion.aggregate(pipeline);

  const records = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  const [total, active, inactive] = await Promise.all([
    Promotion.countDocuments({ ...(userId && { creator: userId }), status: { $ne: "deleted" } }),
    Promotion.countDocuments({ status: "active", ...(userId && { creator: userId }) }),
    Promotion.countDocuments({ status: "inactive", ...(userId && { creator: userId }) }),
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
  return item;
};

const deleteItem = async (id) => {
  const updated = await repository.findByIdAndUpdate(id, { status: "deleted" });
  return !!updated;
};

const getDetails = async (id) => {
  return await repository.findById(id);
};

module.exports = {
  create,
  get,
  update,
  getDetails,
  deleteItem,
};
