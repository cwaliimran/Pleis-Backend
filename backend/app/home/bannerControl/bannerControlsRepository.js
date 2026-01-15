const BannerControls = require("@BannerControlsModel");
const { cache, invalidate } = require("@redisCache");

async function getBannerControlsWithFilters(
  filter,
  page = 1,
  limit = 15,
  sort = { order: 1 }
) {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  return cache({
    namespace: "banners",          // prefix for all banner caches
    params: { page, limit },       // supports pagination
    ttl: null,                     // stays forever until invalidated
    fetchFn: async () => {
      return BannerControls.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .select("description title image type object");
    },
  });
}

module.exports = {
  getBannerControlsWithFilters,
};
