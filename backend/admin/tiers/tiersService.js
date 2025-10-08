// services/tierService.js
const { buildKeywordQueryFromModels } = require("../../helperUtils/queryUtil");
const { generateMeta } = require("../../helperUtils/responseUtil");
const Tiers = require("./Tiers");
const tierRepo = require("./tiersRepository");
const mongoose = require("mongoose");

const createTier = async (data) => {
  return await tierRepo.createTier(data);
};

// Populate venue data for tiers (updated for new schema)
const getTiers = async ({ page, limit, keyword, status, userId, date }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const pipeline = [
    // Match user access (tier creator)
    {
      $match: {
        ...(userId && { creator: new mongoose.Types.ObjectId(userId) })
      }
    }
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

  pipeline.push({ $sort: { createdAt: -1 } });

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

  const tiers = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Additional counts for meta (active/inactive/total by userId as creator)
  const [total, active, inactive] = await Promise.all([
    Tiers.countDocuments({ ...(userId && { creator: userId }), status: { $ne: "deleted" } }),
    Tiers.countDocuments({ status: "active", ...(userId && { creator: userId }) }),
    Tiers.countDocuments({ status: "inactive", ...(userId && { creator: userId }) })
  ]);

  const formattedTiers = tiers.map(tier => {
    const tierDoc = new Tiers(tier);
    return tierDoc.formatResponse ? tierDoc.formatResponse() : tierDoc.toObject();
  });

  const meta = generateMeta(page, limit, totalFiltered);
  meta.tiersCount = { total, active, inactive };

  return {
    tiers: formattedTiers,
    meta
  };
};

const updateTier = async (id, data) => {
  const tier = await tierRepo.findTierById(id);
  if (!tier) return null;

  const allowedFields = [
    "title",
    "entryPoints",
    "retainPoints",
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

  return tier;
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
  return tier;
};

module.exports = {
  createTier,
  getTiers,
  updateTier,
  getTierDetails,
  deleteTier,
};