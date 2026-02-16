const GlobalStatusLevels = require("@GlobalStatusLevelsModel");
const { cache } = require("@redisCache");

const ACTIVE_GLOBAL_LOYALTY_STATUS_LEVEL_CACHE_KEY =
  "globalLLoyaltyStatusLevel:active";

const getStatusLevels = async (query = {}) => {
  const cacheKey =
    `${ACTIVE_GLOBAL_LOYALTY_STATUS_LEVEL_CACHE_KEY}:public:all`;

  return cache({
    namespace: cacheKey,
    ttl: 86400,
    fetchFn: async () => {
      return GlobalStatusLevels.find(query)
        .sort({ entryPoints: 1 })
        .lean();
    },
  });
};

module.exports = {
  getStatusLevels,
};
