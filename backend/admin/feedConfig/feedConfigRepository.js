const FeedConfig = require("./FeedConfig");
const { cache } = require("@redisCache");
const { invalidateFeedConfigCaches } = require("@cacheNamespaces");

const CACHE_KEY = "feed-config";

const findFeedConfig = async () => {
  return FeedConfig.findOne().sort({ createdAt: 1 }).lean();
};

/** Direct Mongo — for home global bundle (parent already Redis-caches). */
const findOrCreateFeedConfigDirect = async () => {
  let config = await findFeedConfig();
  if (!config) {
    config = await FeedConfig.create({});
    return config.toObject ? config.toObject() : config;
  }
  return config;
};

const findOrCreateFeedConfig = async () => {
  return cache({
    namespace: CACHE_KEY,
    ttl: 86400, // 1 day
    fetchFn: findOrCreateFeedConfigDirect,
  });
};

const updateFeedConfig = async (data) => {
  const updated = await FeedConfig.findOneAndUpdate(
    {},
    { $set: data },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
      sort: { createdAt: 1 },
    }
  );

  await invalidateFeedConfigCaches();

  return updated;
};

module.exports = {
  findFeedConfig,
  findOrCreateFeedConfig,
  findOrCreateFeedConfigDirect,
  updateFeedConfig,
};