const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("@utils/responseUtil");

const service = require("./promotionsService");


const get = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status, date } = req.query;
  const timezone = req.user?.timezone;
  const { _id: userId } = req.user || {};

  try {
    const { promotions, meta } = await service.getPromotions({
      userId,
      page,
      limit,
      keyword,
      status,
      date,
      timezone,
    });
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "promotions_fetched_successfully",
      data: promotions,
      meta,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: 500, translationKey: readableError.message, error });
  }
};

const getDetails = async (req, res) => {
  if (!validateParams(req, res, { pathParams: ["id"], objectIdFields: ["id"] })) return;
  try {
    const timezone = req.user?.timezone;
    const { _id: userId } = req.user || {};
    const response = await service.getDetails({
      id: req.params.id,
      userId,
      timezone,
    });
    if (!response) {
      return sendResponse({ res, statusCode: 404, translationKey: "promotion_not_found" });
    }
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "promotion_details_fetched_successfully",
      data: response,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: 500, translationKey: readableError.message, error });
  }
};

const claimPromotion = async (req, res) => {
  if (!validateParams(req, res, { pathParams: ["id"], objectIdFields: ["id"] })) return;
  try {
    const { _id: userId, timezone } = req.user || {};
    const response = await service.claimPromotion(req.params.id, userId, timezone);
    if (!response) {
      return sendResponse({ res, statusCode: 404, translationKey: "promotion_not_found" });
    }
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "promotion_claimed_successfully",
      data: response,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: 500, translationKey: readableError.message, error });
  }
};

module.exports = {
  get,
  getDetails,
  claimPromotion
};
