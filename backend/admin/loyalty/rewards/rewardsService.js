const { buildKeywordQueryFromModels } = require("@dbUtils/queryUtil");
const repository = require("./rewardsRepository");
const mongoose = require("mongoose");
const { generateMeta } = require("@utils/responseUtil");
const formatData = require("./utils/formatReward");
const BaseReward = require("@RewardModel");

const create = async (data) => {
  return await repository.create(data);
};

const get = async ({
  companyOrganizer,
  page,
  limit,
  keyword,
  status,
  date,
  timezone,
}) => {
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
    const keywordMatch = buildKeywordQueryFromModels(
      [{ schema: BaseReward.schema }],
      keyword,
    );
    Object.assign(query, keywordMatch);
  }

  // Get rewards with population
  const records = await repository.getWithFilters(query, skip, limit);

  const totalFiltered = await BaseReward.countDocuments(query);

  const [total, active, inactive] = await Promise.all([
    BaseReward.countDocuments({
      ...(companyOrganizer && { companyOrganizer }),
      status: { $ne: "deleted" },
    }),
    BaseReward.countDocuments({
      status: "active",
      ...(companyOrganizer && { companyOrganizer }),
    }),
    BaseReward.countDocuments({
      status: "inactive",
      ...(companyOrganizer && { companyOrganizer }),
    }),
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.counts = { total, active, inactive };
  const formatted = records.map((item) => formatData(item, timezone));

  return { responses: formatted, meta };
};
const getV2 = async ({
  companyOrganizer,
  page,
  limit,
  keyword,
  status,
  date,
  timezone,
  sortingType,
  sortBy,
  sortOrder,
}) => {
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
    const keywordMatch = buildKeywordQueryFromModels(
      [{ schema: BaseReward.schema }],
      keyword,
    );
    Object.assign(query, keywordMatch);
  }
  if (sortingType) {
    query.sortingType = sortingType;
  }

  // Get rewards with population
  const records = await repository.getWithFilters(
    query,
    skip,
    limit,
    sortBy,
    sortOrder,
  );

  const totalFiltered = await BaseReward.countDocuments(query);

  const rewardMatch = {
    ...(companyOrganizer && { companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer) }),
    status: { $ne: "deleted" },
  };

  const [statsAgg] = await BaseReward.aggregate([
    { $match: rewardMatch },
    { $project: { _id: 1, title: 1 } },

    {
      $lookup: {
        from: "engagementevents",
        let: { rewardId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$entityType", "rewards"] },
                  { $eq: ["$entityId", "$$rewardId"] },
                  { $eq: ["$action", "view"] },
                ],
              },
            },
          },
          { $count: "count" },
        ],
        as: "viewsArr",
      },
    },
    {
      $lookup: {
        from: "favorites",
        let: { rewardId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$targetType", "reward"] },
                  { $eq: ["$targetId", "$$rewardId"] },
                ],
              },
            },
          },
          { $count: "count" },
        ],
        as: "favoritesArr",
      },
    },
    {
      $lookup: {
        from: "loyaltyrewardsorders",
        let: { rewardId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$sourceType", "rewards"] },
                  { $eq: ["$sourceId", "$$rewardId"] },
                ],
              },
            },
          },
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ],
        as: "ordersByStatus",
      },
    },

    {
      $addFields: {
        views: { $ifNull: [{ $arrayElemAt: ["$viewsArr.count", 0] }, 0] },
        favorites: {
          $ifNull: [{ $arrayElemAt: ["$favoritesArr.count", 0] }, 0],
        },
        ordersObj: {
          $arrayToObject: {
            $map: {
              input: "$ordersByStatus",
              as: "o",
              in: { k: "$$o._id", v: "$$o.count" },
            },
          },
        },
      },
    },
    {
      $addFields: {
        claimed: { $ifNull: ["$ordersObj.completed", 0] },
        redeemed: { $ifNull: ["$ordersObj.pending", 0] },
      },
    },

    { $sort: { claimed: -1 } },

    {
      $group: {
        _id: null,
        totalViews: { $sum: "$views" },
        totalFavorites: { $sum: "$favorites" },
        totalClaims: { $sum: "$claimed" },
        totalRedemptions: { $sum: "$redeemed" },
        mostClaimedReward: { $first: { title: "$title", claimed: "$claimed" } },
      },
    },
  ]);

  const totalViews = statsAgg?.totalViews || 0;
  const totalFavorites = statsAgg?.totalFavorites || 0;
  const totalClaims = statsAgg?.totalClaims || 0;
  const totalRedemptions = statsAgg?.totalRedemptions || 0;
const mostClaimedReward =
  statsAgg?.mostClaimedReward?.claimed > 0
    ? {
        name: statsAgg.mostClaimedReward.title,
        count: statsAgg.mostClaimedReward.claimed,
      }
    : { name: null, count: 0 };

  const meta = generateMeta(page, limit, totalFiltered);
  meta.stats = { totalViews, totalFavorites, totalClaims, totalRedemptions, mostClaimedReward };
  const formatted = records.map((item) => formatData(item, timezone));

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
const getAllTypes = async ({ companyOrganizer, page, limit }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const { types: records, meta } = await repository.getAllTypes({
    page,
    limit,
    companyOrganizer,
  });
  return { responses: records, meta };
};

module.exports = {
  create,
  get,
  getV2,
  update,
  getDetails,
  deleteItem,
  getAllTypes,
};
