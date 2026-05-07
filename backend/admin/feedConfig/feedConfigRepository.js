const FeedConfig = require("./FeedConfig");
const { cache, invalidate } = require("@redisCache");

const CACHE_KEY = "feed-config";

const findFeedConfig = async () => {
  return FeedConfig.findOne().sort({ createdAt: 1 });
};

const findOrCreateFeedConfig = async () => {
  return cache({
    namespace: CACHE_KEY,
    ttl: null,
    fetchFn: async () => {
      let config = await findFeedConfig();

      if (!config) {
        config = await FeedConfig.create({});
      }

      return config;
    },
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

  await invalidate(CACHE_KEY);

  return updated;
};

module.exports = {
  findFeedConfig,
  findOrCreateFeedConfig,
  updateFeedConfig,
};