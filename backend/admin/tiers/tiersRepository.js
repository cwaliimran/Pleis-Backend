// repositories/tierRepository.js
const Tiers = require("./Tiers");
const { getModelCounts } = require('@dbUtils/queryUtil');
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

const getCounts = async (query = {}) => {
  return await getModelCounts({
    model: Tiers,
    filterQuery: query,
    statusMap: {
      status: ["active", "inactive"],
    },
  });
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
  const tiers = await getCachedActiveTiers(tierKey);
  return tiers[0] || null;
};


const getNextTier = async (tierKey, currentPoints) => {
  const tiers = await getCachedActiveTiers(tierKey);

  return (
    tiers.find(
      t => t[tierKey]?.entryPoints > currentPoints
    ) || null
  );
};

const getPreviousTier = async (tierKey, currentPoints) => {
  const tiers = await getCachedActiveTiers(tierKey);

  let prev = null;

  for (const tier of tiers) {
    if (tier[tierKey]?.entryPoints < currentPoints)
      prev = tier;
    else break;
  }

  return prev;
};


const getPreviousTierByRetainPoints = async (
  tierKey,
  earned12Months
) => {
  const tiers = await getCachedActiveTiers(tierKey);

  let result = null;

  for (const tier of tiers) {
    if (
      tier[tierKey]?.retainPoints <=
      earned12Months
    ) {
      result = tier;
    }
  }

  return result;
};

const getCachedActiveTiers = async (tierKey) => {
  const cacheKey = `${ACTIVE_TIERS_CACHE_KEY}:public:all:${tierKey}`;

  return cache({
    namespace: cacheKey,
    ttl: 86400,
    fetchFn: async () => {
      return Tiers.find({ status: "active" })
        .sort({ [`${tierKey}.entryPoints`]: 1 })
        .lean();
    },
  });
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
  getCounts,
  getCachedActiveTiers
};