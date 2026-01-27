// services/statusLevelService.js
const { buildKeywordQueryFromModels } = require("@dbUtils/queryUtil");
const { generateMeta } = require("@utils/responseUtil");
const { statusLevelsFormatter } = require("./formatters/statusLevelsFormatter");
const GlobalStatusLevels = require("@GlobalStatusLevelsModel");
const statusLevelRepo = require("./globalStatusLevelsRepository");
const mongoose = require("mongoose");
const { cache, invalidate } = require("@redisCache");
const ACTIVE_GLOBAL_LOYALTY_STATUS_LEVEL_CACHE_KEY = "globalLLoyaltyStatusLevel:active";
const buildGlobalLoyaltyStatusLevelCacheKey = ({
  scope = "public", // public | admin
  skip = 0,
  limit = 10
}) => {
  return `${ACTIVE_GLOBAL_LOYALTY_STATUS_LEVEL_CACHE_KEY}:${scope}:skip=${skip}:limit=${limit}`;
};
const createStatusLevel = async (data) => {
  const allowedFields = [
    "image",
    "title",
    "type",
    "bonusPointsPerEuro",
    "entryPoints",
    "retainPoints",
    "status",
    "backgroundImage",
  ];

  const payload = {};
  for (const k of allowedFields) if (data[k] !== undefined) payload[k] = data[k];

  let statusLevel = await statusLevelRepo.createStatusLevel(payload);
  return statusLevelsFormatter(statusLevel);
};

// Populate venue data for statusLevels (updated for new schema)
const getStatusLevels = async ({ page, limit, keyword, status, userId, date }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const cacheKey = buildGlobalLoyaltyStatusLevelCacheKey({
    scope: "admin",
    skip,
    limit,
  });
  return cache({
    namespace: cacheKey,
    ttl: 86400, // 1 day
 
    fetchFn: async () => {
  const pipeline = [
    // Match user access (statusLevel creator)
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
      { schema: GlobalStatusLevels.schema }
    ],
    keyword
  );

  if (Object.keys(keywordMatch).length) {
    pipeline.push({ $match: keywordMatch });
  }

  pipeline.push({ $sort: { entryPoints: 1 } });

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

  const result = await GlobalStatusLevels.aggregate(pipeline);

  let statusLevels = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Additional counts for meta (active/inactive/total by userId as creator)
  const [total, active, inactive] = await Promise.all([
    GlobalStatusLevels.countDocuments({ ...(userId && { creator: userId }), status: { $ne: "deleted" } }),
    GlobalStatusLevels.countDocuments({ status: "active", ...(userId && { creator: userId }) }),
    GlobalStatusLevels.countDocuments({ status: "inactive", ...(userId && { creator: userId }) })
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.statusLevelsCount = { total, active, inactive };

  //format statusLevels
  statusLevels = statusLevels.map(item => statusLevelsFormatter(item));

  return {
    statusLevels,
    meta
  };
},
  });
};

const updateStatusLevel = async (id, data) => {
  await invalidate(ACTIVE_GLOBAL_LOYALTY_STATUS_LEVEL_CACHE_KEY);
  const statusLevel = await statusLevelRepo.findStatusLevelById(id);
  if (!statusLevel) return null;

  const allowedFields = [
    "image",
    "title",
    "type",
    "bonusPointsPerEuro",
    "entryPoints",
    "retainPoints",
    "status",
    "backgroundImage"
  ];
  const updateData = {};
  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      updateData[key] = data[key];
    }
  }

  if (Object.keys(updateData).length === 0) {
    return statusLevel; // nothing to update
  }

  Object.assign(statusLevel, updateData);
  await statusLevel.save();

  return statusLevelsFormatter(statusLevel);
};

const deleteStatusLevel = async (id) => {
  const updated = await statusLevelRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  return true;
};

const getStatusLevelDetails = async (id) => {
  const statusLevel = await statusLevelRepo.findStatusLevelById(id);
  if (!statusLevel) return null;
  return statusLevelsFormatter(statusLevel);
};
const getTitleStatusLevels = async ({ page, limit, keyword, status, userId, date }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const pipeline = [
    // Match user access (statusLevel creator)
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
    pipeline.push({ $match: { status: { $ne: "deleted" } } }); // Exclude 'deleted' status by default
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
      { schema: GlobalStatusLevels.schema }
    ],
    keyword
  );

  if (Object.keys(keywordMatch).length) {
    pipeline.push({ $match: keywordMatch });
  }

  // Use $project to include only the id and title fields
  pipeline.push({
    $project: {
      _id: 1,      // Include the _id field
      title: 1     // Include the title field
    }
  });

  pipeline.push({ $sort: { entryPoints: 1 } }); // Sort by entryPoints

  // Apply pagination + counts using $facet
  pipeline.push({
    $facet: {
      data: [
        { $skip: skip },
        ...(limit === 0 ? [] : [{ $limit: limit }]) // Apply pagination limit
      ],
      totalFiltered: [{ $count: "count" }] // Total count of status levels
    }
  });

  const result = await GlobalStatusLevels.aggregate(pipeline);

  let statusLevels = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Additional counts for meta (active/inactive/total by userId as creator)
  const [total, active, inactive] = await Promise.all([
    GlobalStatusLevels.countDocuments({ ...(userId && { creator: userId }), status: { $ne: "deleted" } }),
    GlobalStatusLevels.countDocuments({ status: "active", ...(userId && { creator: userId }) }),
    GlobalStatusLevels.countDocuments({ status: "inactive", ...(userId && { creator: userId }) })
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.statusLevelsCount = { total, active, inactive };

  // Format statusLevels to include only id and title
  statusLevels = statusLevels.map(item => {
    return {
      _id: item._id,
      title: item.title
    };
  });

  return {
    statusLevels,
    meta
  };
};

module.exports = {
  createStatusLevel,
  getStatusLevels,
  updateStatusLevel,
  getStatusLevelDetails,
  deleteStatusLevel,
  getTitleStatusLevels
};