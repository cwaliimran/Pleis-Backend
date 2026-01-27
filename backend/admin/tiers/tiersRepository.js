// repositories/tierRepository.js
const Tiers = require("./Tiers");
const { cache, invalidate } = require("@redisCache");
const ACTIVE_TIERS_CACHE_KEY = "tiers:active";
const buildTiersCacheKey = ({
  scope = "public", // public | admin
  skip = 0,
  limit = 10
}) => {
  return `${ACTIVE_TIERS_CACHE_KEY}:${scope}:skip=${skip}:limit=${limit}`;
};
// Create tier in a transaction and update organization
const createTier = async (data) => {
  try {
    // Create tier
    const tier = new Tiers(data);
    await tier.save();
    await invalidate(ACTIVE_TIERS_CACHE_KEY); // Invalidate cache
    return tier;
  } catch (err) {
    throw err;
  }
};

// Get all tiers with their assigned organization populated, sorted by essential.entryPoints ascending (lowest points first)
const getTiersWithFilters = async (query = {}, skip = 0, limit = 10) => {
    const cacheKey = buildTiersCacheKey({
    scope: "admin",
    skip,
    limit,
  });
  return cache({
    namespace: cacheKey,
    ttl: 86400, // 1 day
 
    fetchFn: async () => {
  return Tiers.find(query)
    .sort({ "essential.entryPoints": 1 }) // Ascending: lowest points (e.g., Silver) first
    .skip(skip)
    .limit(limit);
},
  });
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
  await invalidate(ACTIVE_TIERS_CACHE_KEY); // Invalidate cache
  return await tier.save();
};

// Delete
const deleteTierById = async (tier) => {
  await invalidate(ACTIVE_TIERS_CACHE_KEY); // Invalidate cache
  return await tier.deleteOne();
};

//findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  await invalidate(ACTIVE_TIERS_CACHE_KEY); // Invalidate cache
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