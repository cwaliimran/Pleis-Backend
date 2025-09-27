// services/presetService.js
const { buildKeywordQueryFromModels } = require("../../../helperUtils/queryUtil");
const { generateMeta } = require("../../../helperUtils/responseUtil");
const Venues = require("../../venues/Venues");
const Presets = require("./Presets");
const presetRepo = require("./presetsRepository");
const mongoose = require("mongoose");

const createPreset = async (data) => {
  return await presetRepo.createPreset(data);
};

// Populate venue data for presets (updated for new schema)
const getPresets = async ({ page, limit, keyword, status, userId, date }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const pipeline = [
    // Match user access (preset creator)
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
      { schema: Presets.schema }
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

  const result = await Presets.aggregate(pipeline);

  const presets = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Additional counts for meta (active/inactive/total by userId as creator)
  const [total, active, inactive] = await Promise.all([
    Presets.countDocuments({ ...(userId && { creator: userId }), status: { $ne: "deleted" } }),
    Presets.countDocuments({ status: "active", ...(userId && { creator: userId }) }),
    Presets.countDocuments({ status: "inactive", ...(userId && { creator: userId }) })
  ]);

  const formattedPresets = presets.map(preset => {
    const presetDoc = new Presets(preset);
    return presetDoc.formatResponse ? presetDoc.formatResponse() : presetDoc.toObject();
  });

  const meta = generateMeta(page, limit, totalFiltered);
  meta.presetsCount = { total, active, inactive };

  return {
    presets: formattedPresets,
    meta
  };
};

const updatePreset = async (id, data) => {
  const preset = await presetRepo.findPresetById(id);
  if (!preset) return null;

  const allowedFields = [
    "image",
    "title",
    "description",
    "basePrice",
    "status"
  ];
  const updateData = {};
  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      updateData[key] = data[key];
    }
  }

  if (Object.keys(updateData).length === 0) {
    return preset; // nothing to update
  }

  Object.assign(preset, updateData);
  await preset.save();

  return preset;
};

const deletePreset = async (id) => {
  const updated = await presetRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  return true;
};

const getPresetDetails = async (id) => {
  const preset = await presetRepo.findPresetById(id);
  if (!preset) return null;
  return preset;
};

module.exports = {
  createPreset,
  getPresets,
  updatePreset,
  getPresetDetails,
  deletePreset,
};
