// services/bannerControlsService.js
const bannerControlsRepo = require("./bannerControlsRepository");
const { formatBannerObject } = require("./fomatter/formatBannerObject");


const getBannerControlsService = async ({ page, limit }) => {
  const query = {
    status: { $ne: "deleted" },
  };
  let [bannerControls] = await Promise.all([
    bannerControlsRepo.getBannerControlsWithFilters(query, page, limit),
  ]);

  //format bannerControls
  bannerControls = bannerControls.map(item => {
    return formatBannerObject(item);
  });

  return { bannerControls };
};

module.exports = {
  getBannerControlsService,
};