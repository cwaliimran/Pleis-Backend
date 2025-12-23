

const BannerControls = require("@BannerControlsModel");

async function getBannerControlsWithFilters(filter, page = 1, limit = 15, sort = { order: 1 }) {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  return BannerControls.find(filter)
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .select('description title image type object');
}


module.exports = {
  getBannerControlsWithFilters,
};