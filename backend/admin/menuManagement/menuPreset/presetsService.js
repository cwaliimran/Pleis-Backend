// services/presetService.js
const { buildKeywordQueryFromModels } = require("@dbUtils/queryUtil");
const { getFullImageUrl } = require("@utils/imageHelper"); 

const { generateMeta } = require("@utils/responseUtil");
const Presets = require("@PresetsModel");
const presetRepo = require("./presetsRepository");
const mongoose = require("mongoose");
const { formatItemCategory } = require("../menuItems/formatter/formatMenuItems");

const createPreset = async (data) => {
  let preset = await presetRepo.createPreset(data);
  preset.image = getFullImageUrl(preset.image || "noimage.png");
  return preset;
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

  // Populate category and project only _id, image, and title
  pipeline.push({
    $lookup: {
      from: "menuitemcategories",
      localField: "category",
      foreignField: "_id",
      as: "category",
      pipeline: [
        {
          $project: {
            _id: 1,
            image: 1,
            title: 1
          }
        }
      ]
    }
  });
  pipeline.push({
    $unwind: {
      path: "$category",
      preserveNullAndEmptyArrays: true
    }
  });

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

  //format presets
  const formattedPresets = presets.map(preset => ({
    ...preset,
    category: formatItemCategory(preset.category),
    image: getFullImageUrl(preset.image || "noimage.png")
  }));

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
    "category",
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

  //get updated preset with populated category
  const updatedPreset = await presetRepo.findPresetById(preset._id);
  updatedPreset.image = getFullImageUrl(updatedPreset.image || "noimage.png");
  updatedPreset.category = formatItemCategory(updatedPreset.category);

  return updatedPreset;
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
  preset.image = getFullImageUrl(preset.image || "noimage.png");
  preset.category = formatItemCategory(preset.category);
  return preset;
};

module.exports = {
  createPreset,
  getPresets,
  updatePreset,
  getPresetDetails,
  deletePreset,
};
