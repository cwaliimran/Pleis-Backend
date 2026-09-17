const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
} = require("@utils/responseUtil");

const service = require("./promotionsService");

const get = async (req, res) => {
  const { page, limit, skip } = parsePaginationParams(req);
  const { keyword } = req.query;

  const { _id: userId, timezone } = req.user;
  try {
    const { responses, meta } = await service.getGlobalPromotionsService({
      userId,
      page,
      limit,
      skip,
      keyword,
      timezone,
    });
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "promotions_fetched_successfully",
      data: responses,
      meta,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: 500, translationKey: readableError.message, error });
  }
};

const getDetails = async (req, res) => {
  if (!validateParams(req, res, { pathParams: ["id"], objectIdFields: ["id"] })) return;
  const { timezone, _id: userId } = req.user;
  try {
    const response = await service.getDetails(req.params.id, timezone, userId);
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
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "promotion_claimed_successfully",
      data: response,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode || 400,
      translationKey: readableError.message,
      error,
    });
  }
};

module.exports = {
  get,
  getDetails,
  claimPromotion,
};
