// repositories/presetRepository.js
const Presets = require("./Presets");
const mongoose = require("mongoose");

// Create preset in a transaction and update organization
const createPreset = async (data) => {
  try {
    // Create preset
    const preset = new Presets(data);
    await preset.save();
    return preset;
  } catch (err) {
    throw err;
  }
};

// Get all presets with their assigned organization populated, sorted by createdAt descending
const getPresetsWithFilters = async (query = {}, skip = 0, limit = 10) => {
  return Presets.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
};

// Count by condition
const countPresets = async (query = {}) => {
  return Presets.countDocuments(query);
};

// Find by ID
const findPresetById = async (id) => {
  return Presets.findById(id);
};

// Update and save
const updatePresetData = async (preset, data) => {
  Object.assign(preset, data);
  return await preset.save();
};

// Delete
const deletePresetById = async (preset) => {
  return await preset.deleteOne();
};

//findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
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
