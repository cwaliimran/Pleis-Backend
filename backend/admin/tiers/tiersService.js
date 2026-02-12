// services/tierService.js
const { buildKeywordQueryFromModels } = require("../../helperUtils/dbUtils/queryUtil");
const { generateMeta } = require("../../helperUtils/responseUtil");
const { tiersFormatter } = require("./formatters/tiersFormatter");
const Tiers = require("./Tiers");
const tierRepo = require("./tiersRepository");
const mongoose = require("mongoose");
const { cache, invalidate } = require("@redisCache");
const ACTIVE_TIERS_CACHE_KEY = "tiers:active";
const buildTiersCacheKey = ({
  scope = "public", // public | admin
  skip = 0,
  limit = 10
}) => {
  return `${ACTIVE_TIERS_CACHE_KEY}:${scope}:skip=${skip}:limit=${limit}`;
};
const createTier = async (data) => {
  let tier = await tierRepo.createTier(data);
  return tiersFormatter(tier);
};

// Populate venue data for tiers (updated for new schema)
// Sort tiers so the one with lowest bonusPointsPerEuro (e.g. Silver) is on top
const getTiers = async ({ page, limit, keyword, status, date }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const cacheKey = buildTiersCacheKey({
    scope: "admin",
    skip,
    limit,
  });

  return cache({
    namespace: cacheKey,
    ttl: 86400,

    fetchFn: async () => {
      /* --------------------------
         Build base query
      ---------------------------*/
      const query = {};

      if (status) {
        query.status = status;
      } else {
        query.status = { $ne: "deleted" };
      }

      if (date) {
        const start = new Date(date);
        const end = new Date(date);
        end.setDate(start.getDate() + 1);

        query.createdAt = { $gte: start, $lt: end };
      }

      const keywordMatch = buildKeywordQueryFromModels(
        [{ schema: Tiers.schema }],
        keyword
      );

      if (Object.keys(keywordMatch).length) {
        Object.assign(query, keywordMatch);
      }

      /* --------------------------
         Aggregation pipeline
      ---------------------------*/
      const pipeline = [
        { $match: query },

        { $sort: { "essential.entryPoints": 1 } },

        {
          $facet: {
            data: [
              { $skip: skip },
              ...(limit === 0 ? [] : [{ $limit: limit }]),
            ],
            totalFiltered: [{ $count: "count" }],
          },
        },
      ];

      const [result, counts] = await Promise.all([
        Tiers.aggregate(pipeline),
        tierRepo.getCounts(query),
      ]);

      const { totalFiltered, total, active, inactive } = counts;

      let tiers = result[0]?.data || [];

      const meta = generateMeta(page, limit, totalFiltered);
      meta.tiersCount = { total, active, inactive };

      tiers = tiers.map(item => tiersFormatter(item));

      return { tiers, meta };
    },
  });
};


const updateTier = async (id, data) => {
  await invalidate(ACTIVE_TIERS_CACHE_KEY); // Invalidate cache
  const tier = await tierRepo.findTierById(id);
  if (!tier) return null;

  const allowedFields = [
    "image",
    "title",
    "bonusPointsPerEuro",
    "essential",
    "preferred",
    "premier",
    "status"
  ];
  const updateData = {};
  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      updateData[key] = data[key];
    }
  }

  if (Object.keys(updateData).length === 0) {
    return tier; // nothing to update
  }

  Object.assign(tier, updateData);
  await tier.save();

  return tiersFormatter(tier);
};

const deleteTier = async (id) => {
  const updated = await tierRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  return true;
};

const getTierDetails = async (id) => {
  const tier = await tierRepo.findTierById(id);
  if (!tier) return null;
  return tiersFormatter(tier);
};

module.exports = {
  createTier,
  getTiers,
  updateTier,
  getTierDetails,
  deleteTier,
};