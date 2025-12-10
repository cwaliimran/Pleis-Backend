// repositories/statusLevelRepository.js
const StatusLevels = require("./StatusLevels");
const mongoose = require("mongoose");

// Create statusLevel in a transaction and update organization
const createStatusLevel = async (data) => {
  try {
    // Create statusLevel
    const statusLevel = new StatusLevels(data);
    await statusLevel.save();
    return statusLevel;
  } catch (err) {
    throw err;
  }
};

// Get first status level where entryPoints are minimum, only select _id
const getFirstStatusLevel = async () => {
  return await StatusLevels.findOne().select("_id entryPoints retainPoints").sort({ entryPoints: 1 });
};

//get next status level where entryPoints are higher than provided points
const getNextStatusLevel = async (points) => {
  return await StatusLevels.findOne({ entryPoints: { $gt: points } }).select("image entryPoints retainPoints title").sort({ entryPoints: 1 });
};
//get previous status level
const getPreviousStatusLevel = async (points) => {
  return await StatusLevels.findOne({ entryPoints: { $lt: points } }).select("image entryPoints retainPoints title").sort({ entryPoints: -1 });
};


// get all higher levels than current entry points
const getAllHigherLevels = async (currentEntryPoints) => {
  return await StatusLevels.find({
    entryPoints: { $gt: currentEntryPoints }
  })
    .sort({ entryPoints: 1 })   // ascending
    .select("title image entryPoints retainPoints");
};


// Find the correct fallback level based on 12-month earned points
const getPreviousStatusLevelByRetainPoints = async (earned12Months) => {
  return await StatusLevels.findOne({
    retainPoints: { $lte: earned12Months }
  })
    .select("title image entryPoints retainPoints")
    .sort({ retainPoints: -1 });  // pick highest eligible level
};


// Get all statusLevels with their assigned organization populated, sorted by createdAt descending
const getStatusLevelsWithFilters = async (query = {}, skip = 0, limit = 10) => {
  return StatusLevels.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
};

// Count by condition
const countStatusLevels = async (query = {}) => {
  return StatusLevels.countDocuments(query);
};

// Find by ID
const findStatusLevelById = async (id) => {
  return StatusLevels.findById(id);
};

// Update and save
const updateStatusLevelData = async (statusLevel, data) => {
  Object.assign(statusLevel, data);
  return await statusLevel.save();
};

// Delete
const deleteStatusLevelById = async (statusLevel) => {
  return await statusLevel.deleteOne();
};

//findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  return StatusLevels.findByIdAndUpdate(id, data, { new: true });
};

module.exports = {
  createStatusLevel,
  getStatusLevelsWithFilters,
  countStatusLevels,
  findStatusLevelById,
  updateStatusLevelData,
  deleteStatusLevelById,
  findByIdAndUpdate,
  getFirstStatusLevel,
  getNextStatusLevel,
  getAllHigherLevels,
  getPreviousStatusLevelByRetainPoints,
  getPreviousStatusLevel
};