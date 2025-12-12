// services/tierService.js
const { buildKeywordQueryFromModels } = require("../../helperUtils/dbUtils/queryUtil");
const { generateMeta } = require("../../helperUtils/responseUtil");
const { tiersFormatter } = require("./formatters/tiersFormatter");
const Tiers = require("./Tiers");
const tierRepo = require("./tiersRepository");
const mongoose = require("mongoose");

const createTier = async (data) => {
  let tier = await tierRepo.createTier(data);
  return tiersFormatter(tier);
};

// Populate venue data for tiers (updated for new schema)
// Sort tiers so the one with lowest bonusPointsPerEuro (e.g. Silver) is on top
const getTiers = async ({ page, limit, keyword, status, date }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const pipeline = [
  ];

  // Apply filters
  if (status) {
    pipeline.push({ $match: { status } });
  } else {
    pipeline.push({ $match: { status: { $ne: "deleted" } } });
  }

  if (date) {
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    pipeline.push({
      $match: {
        createdAt: { $gte: start, $lt: end }
      }
    });
  }

  const keywordMatch = buildKeywordQueryFromModels(
    [
      { schema: Tiers.schema }
    ],
    keyword
  );

  if (Object.keys(keywordMatch).length) {
    pipeline.push({ $match: keywordMatch });
  }

  // Sort by bonusPointsPerEuro ascending (lowest first)
  pipeline.push({ $sort: { "essential.entryPoints": 1 } });

  // Apply pagination + counts using $facet
  pipeline.push({
    $facet: {
      data: [
        { $skip: skip },
        ...(limit === 0 ? [] : [{ $limit: limit }])
      ],
      totalFiltered: [{ $count: "count" }]
    }
  });

  const result = await Tiers.aggregate(pipeline);

  let tiers = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  //TODO use modelCounts utility
  // Additional counts for meta (active/inactive/total by userId as creator)
  const [total, active, inactive] = await Promise.all([
    Tiers.countDocuments({ status: { $ne: "deleted" } }),
    Tiers.countDocuments({ status: "active", }),
    Tiers.countDocuments({ status: "inactive", })
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.tiersCount = { total, active, inactive };

  //format tiers
  tiers = tiers.map(item => tiersFormatter(item));

  return {
    tiers,
    meta
  };
};

const updateTier = async (id, data) => {
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