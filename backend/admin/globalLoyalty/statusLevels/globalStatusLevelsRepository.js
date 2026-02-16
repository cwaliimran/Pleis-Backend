// repositories/statusLevelRepository.js
const GlobalStatusLevels = require("@GlobalStatusLevelsModel");
const { cache, invalidate } = require("@redisCache");

const ACTIVE_GLOBAL_LOYALTY_STATUS_LEVEL_CACHE_KEY =
  "globalLLoyaltyStatusLevel:active";

const buildGlobalLoyaltyStatusLevelCacheKey = ({
  scope = "public",
  skip = 0,
  limit = 10,
}) => {
  return `${ACTIVE_GLOBAL_LOYALTY_STATUS_LEVEL_CACHE_KEY}:${scope}:skip=${skip}:limit=${limit}`;
};

/* ============================================================
   Cached active levels (core loader)
============================================================ */
const getCachedActiveLevels = async () => {
  const cacheKey =
    `${ACTIVE_GLOBAL_LOYALTY_STATUS_LEVEL_CACHE_KEY}:public:all`;

  return cache({
    namespace: cacheKey,
    ttl: 86400,
    fetchFn: async () => {
      return GlobalStatusLevels.find({
        status: { $ne: "deleted" },
      })
        .sort({ entryPoints: 1 })
        .select("title image entryPoints retainPoints")
        .lean();
    },
  });
};

/* ============================================================
   CREATE
============================================================ */
const createStatusLevel = async (data) => {
  const statusLevel = new GlobalStatusLevels(data);
  await statusLevel.save();
  await invalidate(ACTIVE_GLOBAL_LOYALTY_STATUS_LEVEL_CACHE_KEY);
  return statusLevel;
};

/* ============================================================
   FIRST LEVEL
============================================================ */
const getFirstStatusLevel = async () => {
  const levels = await getCachedActiveLevels();
  return levels[0] || null;
};

/* ============================================================
   NEXT LEVEL
============================================================ */
const getNextStatusLevel = async (points) => {
  const levels = await getCachedActiveLevels();

  return (
    levels.find(l => l.entryPoints > points) || null
  );
};

/* ============================================================
   PREVIOUS LEVEL
============================================================ */
const getPreviousStatusLevel = async (points) => {
  const levels = await getCachedActiveLevels();

  let prev = null;

  for (const lvl of levels) {
    if (lvl.entryPoints < points) prev = lvl;
    else break;
  }

  return prev;
};

/* ============================================================
   ALL HIGHER LEVELS
============================================================ */
const getAllHigherLevels = async (currentEntryPoints) => {
  const levels = await getCachedActiveLevels();

  return levels.filter(
    lvl => lvl.entryPoints > currentEntryPoints
  );
};

/* ============================================================
   FALLBACK BY RETAIN POINTS
============================================================ */
const getPreviousStatusLevelByRetainPoints = async (
  earned12Months
) => {
  const levels = await getCachedActiveLevels();

  let result = null;

  for (const lvl of levels) {
    if (lvl.retainPoints <= earned12Months) {
      result = lvl;
    }
  }

  return result;
};

/* ============================================================
   ADMIN LIST (paginated)
============================================================ */
const getStatusLevelsWithFilters = async (
  query = {},
  skip = 0,
  limit = 10
) => {
  const cacheKey = buildGlobalLoyaltyStatusLevelCacheKey({
    scope: "admin",
    skip,
    limit,
  });

  return cache({
    namespace: cacheKey,
    ttl: 86400,
    fetchFn: async () => {
      return GlobalStatusLevels.find(query)
        .sort({ entryPoints: 1 })
        .skip(skip)
        .limit(limit);
    },
  });
};

/* ============================================================
   COUNTS & DIRECT ACCESS
============================================================ */
const countStatusLevels = async (query = {}) =>
  GlobalStatusLevels.countDocuments(query);

const findStatusLevelById = async (id) =>
  GlobalStatusLevels.findById(id);

/* ============================================================
   UPDATE
============================================================ */
const updateStatusLevelData = async (
  statusLevel,
  data
) => {
  await invalidate(ACTIVE_GLOBAL_LOYALTY_STATUS_LEVEL_CACHE_KEY);
  Object.assign(statusLevel, data);
  return await statusLevel.save();
};

const findByIdAndUpdate = async (id, data) => {
  await invalidate(ACTIVE_GLOBAL_LOYALTY_STATUS_LEVEL_CACHE_KEY);
  return GlobalStatusLevels.findByIdAndUpdate(id, data, {
    new: true,
  });
};

/* ============================================================
   EXPORTS
============================================================ */
module.exports = {
  createStatusLevel,
  getStatusLevelsWithFilters,
  countStatusLevels,
  findStatusLevelById,
  updateStatusLevelData,
  findByIdAndUpdate,
  getFirstStatusLevel,
  getNextStatusLevel,
  getAllHigherLevels,
  getPreviousStatusLevelByRetainPoints,
  getPreviousStatusLevel,
};
