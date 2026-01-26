// repositories/presetRepository.js
const Presets = require("@PresetsModel");
const { cache, invalidate } = require("@redisCache");
const ACTIVE_MENU_PRESETS_CACHE_KEY = "menuPresets:active";
const buildMenuPresetsCacheKey = ({
  scope = "admin", // public | admin
  skip = 0,
  limit = 10
}) => {
  return `${ACTIVE_MENU_PRESETS_CACHE_KEY}:${scope}:skip=${skip}:limit=${limit}`;
};
// Create preset in a transaction and update organization
const createPreset = async (data) => {
  try {
    // Create preset
    const preset = new Presets(data);
    await preset.save();
    await invalidate(ACTIVE_MENU_PRESETS_CACHE_KEY);
    return preset;
  } catch (err) {
    throw err;
  }
};

// Get all presets with their assigned organization populated, sorted by createdAt descending
const getPresetsWithFilters = async (query = {}, skip = 0, limit = 10) => {
  const cacheKey = buildMenuPresetsCacheKey({
    scope: "admin",
    skip,
    limit,
  });

  return cache({
    namespace: cacheKey,
    ttl: 86400, // 1 day

    fetchFn: async () => {
      const presets = await Presets.find(query)
        .populate("category", "_id image title")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      if (!presets || presets.length === 0) {
        return presets;
      }

      return presets;
    },
  });
};


// Count by condition
const countPresets = async (query = {}) => {
  return Presets.countDocuments(query);
};

// Find by ID
const findPresetById = async (id) => {
  return Presets.findById(id).populate("category", "_id image title");
};

// Update and save
const updatePresetData = async (preset, data) => {
  Object.assign(preset, data);
  await invalidate(ACTIVE_MENU_PRESETS_CACHE_KEY);
  return await preset.save();
};

// Delete
const deletePresetById = async (preset) => {
  await invalidate(ACTIVE_MENU_PRESETS_CACHE_KEY);
  return await preset.deleteOne();
};

//findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  await invalidate(ACTIVE_MENU_PRESETS_CACHE_KEY);
  return Presets.findByIdAndUpdate(id, data, { new: true });
};

module.exports = {
  createPreset,
  getPresetsWithFilters,
  countPresets,
  findPresetById,
  updatePresetData,
  deletePresetById,
  findByIdAndUpdate,
};
