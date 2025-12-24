const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
} = require("../../helperUtils/responseUtil");

const bannerControlsService = require("./bannerControlsService");

const getBannerControls = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status, date, orderSort } = req.query;

  try {
    if (date && !validateParams(req, res, {
      dateFields: {
        date: "YYYY-MM-DD",
      },
    })) return;

    const { bannerControls, meta } = await bannerControlsService.getBannerControlsService({
      page,
      limit,
      keyword,
      status,
      date,
      orderSort
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "banner_controls_fetched_successfully",
      data: bannerControls,
      meta
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
};


module.exports = {
  getBannerControls,
};