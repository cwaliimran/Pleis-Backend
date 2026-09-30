const BannerControls = require("@BannerControlsModel");
const { cache } = require("@redisCache");

function stableJson(value) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return String(value);
  }
}

async function findBannerControls(filter, page = 1, limit = 15, sort = { order: 1 }) {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  return BannerControls.find(filter)
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .select("description title image type object")
    .lean();
}

async function getBannerControlsWithFilters(
  filter,
  page = 1,
  limit = 15,
  sort = { order: 1 }
) {
  return cache({
    namespace: "banners",
    params: {
      page,
      limit,
      filter: stableJson(filter),
      sort: stableJson(sort),
    },
    ttl: 86400, // 1 day (also invalidated on banner CRUD)
    fetchFn: () => findBannerControls(filter, page, limit, sort),
  });
}

module.exports = {
  getBannerControlsWithFilters,
  findBannerControls,
};
