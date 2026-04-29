// repositories/tierRepository.js
const Tiers = require("@TiersModel");

// Create tier in a transaction and update organization
const createTier = async (data) => {
  try {
    // Create tier
    const tier = new Tiers(data);
    await tier.save();
    return tier;
  } catch (err) {
    throw err;
  }
};

// Get all tiers with their assigned organization populated, sorted by createdAt descending
const getTiersWithFilters = async (query = {}, skip = 0, limit = 10) => {
  return Tiers.find(query)
    .sort({ title: 1 })
    .skip(skip)
    .limit(limit);
};

// Count by condition
const countTiers = async (query = {}) => {
  return Tiers.countDocuments(query);
};

// Find by ID
const findTierById = async (id) => {
  return Tiers.findById(id);
};

// Update and save
const updateTierData = async (tier, data) => {
  Object.assign(tier, data);
  return await tier.save();
};

// Delete
const deleteTierById = async (tier) => {
  return await tier.deleteOne();
};

//findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  return Tiers.findByIdAndUpdate(id, data, { new: true });
};

module.exports = {
  createTier,
  getTiersWithFilters,
  countTiers,
  findTierById,
  updateTierData,
  deleteTierById,
  findByIdAndUpdate,
};