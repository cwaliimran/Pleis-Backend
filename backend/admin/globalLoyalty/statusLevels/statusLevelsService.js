// services/statusLevelService.js
const { buildKeywordQueryFromModels } = require("@dbUtils/queryUtil");
const { generateMeta } = require("@utils/responseUtil");
const { statusLevelsFormatter } = require("./formatters/statusLevelsFormatter");
const StatusLevels = require("./StatusLevels");
const statusLevelRepo = require("./statusLevelsRepository");
const mongoose = require("mongoose");

const createStatusLevel = async (data) => {
  const allowedFields = [
    "image",
    "title",
    "type",
    "bonusPointsPerEuro",
    "entryPoints",
    "retainPoints",
    "status",
  ];

  const payload = {};
  for (const k of allowedFields) if (data[k] !== undefined) payload[k] = data[k];

  let statusLevel = await statusLevelRepo.createStatusLevel(payload);
  return statusLevelsFormatter(statusLevel);
};

// Populate venue data for statusLevels (updated for new schema)
const getStatusLevels = async ({ page, limit, keyword, status, userId, date }) => {
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
      { schema: StatusLevels.schema }
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

  const result = await StatusLevels.aggregate(pipeline);

  let statusLevels = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Additional counts for meta (active/inactive/total by userId as creator)
  const [total, active, inactive] = await Promise.all([
    StatusLevels.countDocuments({ ...(userId && { creator: userId }), status: { $ne: "deleted" } }),
    StatusLevels.countDocuments({ status: "active", ...(userId && { creator: userId }) }),
    StatusLevels.countDocuments({ status: "inactive", ...(userId && { creator: userId }) })
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.statusLevelsCount = { total, active, inactive };

  //format statusLevels
  statusLevels = statusLevels.map(item => statusLevelsFormatter(item));

  return {
    statusLevels,
    meta
  };
};

const updateStatusLevel = async (id, data) => {
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

module.exports = {
  createStatusLevel,
  getStatusLevels,
  updateStatusLevel,
  getStatusLevelDetails,
  deleteStatusLevel,
};