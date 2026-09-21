// services/bannerControlsService.js
const bannerControlsRepo = require("./bannerControlsRepository");
const { formatBannerObject } = require("./fomatter/formatBannerObject");


const queryActive = { status: { $ne: "deleted" } };

const getBannerControlsService = async ({ page, limit }) => {
  let bannerControls = await bannerControlsRepo.getBannerControlsWithFilters(
    queryActive,
    page,
    limit
  );

  bannerControls = bannerControls.map((item) => formatBannerObject(item));
  return { bannerControls };
};

/**
 * Home global bundle already Redis-caches the result. Skip nested Azure Redis
 * for banners (local Mongo is cheaper than an extra Azure RTT).
 */
const getBannerControlsForHomeService = async ({ page, limit }) => {
  let bannerControls = await bannerControlsRepo.findBannerControls(
    queryActive,
    page,
    limit
  );
  bannerControls = bannerControls.map((item) => formatBannerObject(item));
  return { bannerControls };
};

module.exports = {
  getBannerControlsService,
  getBannerControlsForHomeService,
};