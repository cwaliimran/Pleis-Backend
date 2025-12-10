const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("@utils/responseUtil");

const service = require("./listingsService");


const getListings = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status, date, companyOrganizer } = req.query;
  const userId = companyOrganizer || req.user._id;
  console.log("User ID:", userId);

  try {
    const { listings, meta } = await service.getListings({
      page,
      limit,
      keyword,
      status,
      date,
      timezone: req.user?.timezone,
      userId
    });
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "listings_fetched_successfully",
      data: listings,
      meta,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: 500, translationKey: readableError.message, error });
  }
};


module.exports = {
  getListings,
};
