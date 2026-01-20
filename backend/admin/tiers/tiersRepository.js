// repositories/tierRepository.js
const Tiers = require("./Tiers");

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

// Get all tiers with their assigned organization populated, sorted by essential.entryPoints ascending (lowest points first)
const getTiersWithFilters = async (query = {}, skip = 0, limit = 10) => {
  return Tiers.find(query)
    .sort({ "essential.entryPoints": 1 }) // Ascending: lowest points (e.g., Silver) first
    .skip(skip)
    .limit(limit);
};

const getActiveTiersWithProjection = async (projection = { title: 1, _id: 1 }) => {
  return Tiers.find(
    { status: "active" },
    projection
  ).lean();
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
const getField = (tierKey) => `${tierKey}.entryPoints`;

const getFirstTier = async (tierKey) => {
  return Tiers.findOne()
    .sort({ [getField(tierKey)]: 1 })
    .select(`title image ${tierKey}.entryPoints ${tierKey}.retainPoints`);
};

const getNextTier = async (tierKey, currentPoints) => {
  return Tiers.findOne({
    [getField(tierKey)]: { $gt: currentPoints }
  })
    .sort({ [getField(tierKey)]: 1 });
};

const getPreviousTier = async (tierKey, currentPoints) => {
  return Tiers.findOne({
    [getField(tierKey)]: { $lt: currentPoints }
  })
    .sort({ [getField(tierKey)]: -1 });
};

const getPreviousTierByRetainPoints = async (tierKey, earned12Months) => {
  return Tiers.findOne({
    [`${tierKey}.retainPoints`]: { $lte: earned12Months }
  })
    .sort({ [`${tierKey}.retainPoints`]: -1 });
};

module.exports = {
  getFirstTier,
  getNextTier,
  getPreviousTier,
  getPreviousTierByRetainPoints,
  createTier,
  getTiersWithFilters,
  countTiers,
  findTierById,
  updateTierData,
  deleteTierById,
  findByIdAndUpdate,
  getActiveTiersWithProjection,
};