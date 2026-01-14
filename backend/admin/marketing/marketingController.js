const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("@utils/responseUtil");

const MarketingService = require("./marketingService");

const createMarketing = async (req, res) => {
  const rawData = [
    "title",
    "description",
    "budget",
    "email",
    "phoneNumber",
  ];

  // Validation
  if (!validateParams(req, res, { rawData })) return;

  try {
    // Get the userId from the authenticated user
    const userId = req.user._id;
    
    // Add the userId to the request body before saving
    req.body.userId = userId;

    // Create the marketing campaign using the service
    const marketing = await MarketingService.createMarketing(req.body);

    // Return success response with the created marketing campaign
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "Marketing_created_successfully",
      data: marketing,
    });
  } catch (error) {
    // Handle any errors and return a readable error message
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode,
      translationKey: readableError.message,
      error,
    });
  }
};


const getMarketings = async (req, res) => {

  if (req.user.accountState && req.user.accountState.userType === "organizer") {
    return getUserMarketings(req, res);
  }
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status, date } = req.query;
  try {


    const { Marketings, meta } = await MarketingService.getMarketings({
      page,
      limit,
      keyword,
      status,
      date,
      timezone: req.user?.timezone,
    });
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Marketings_fetched_successfully",
      data: Marketings,
      meta,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: 500, translationKey: readableError.message, error });
  }
};

const getMarketingDetails = async (req, res) => {
  if (!validateParams(req, res, { pathParams: ["id"], objectIdFields: ["id"] })) return;
  try {
    const Marketing = await MarketingService.getMarketingDetails(req.params.id);
    if (!Marketing) {
      return sendResponse({ res, statusCode: 404, translationKey: "Marketing_not_found" });
    }
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Marketing_details_fetched_successfully",
      data: Marketing,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: 500, translationKey: readableError.message, error });
  }
};

const updateMarketing = async (req, res) => {
  if (!validateParams(req, res, { pathParams: ["id"], objectIdFields: ["id"] })) return;

  // Extract status from the query string, if available
  const { status } = req.query;

  try {
    // If status is provided, update the status of the marketing entry
    const updateData = { ...req.body };
    if (status) {
      updateData.status = status;  // Assign the status from query string
    }

    const updated = await MarketingService.updateMarketing(req.params.id, updateData);

    if (!updated) {
      return sendResponse({ res, statusCode: 404, translationKey: "Marketing_not_found" });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Marketing_updated_successfully",
      data: updated,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: 500, translationKey: readableError.message, error });
  }
};

const deleteMarketing = async (req, res) => {
  if (!validateParams(req, res, { pathParams: ["id"], objectIdFields: ["id"] })) return;
  try {
    const deleted = await MarketingService.deleteMarketing(req.params.id);
    if (!deleted) {
      return sendResponse({ res, statusCode: 404, translationKey: "Marketing_not_found" });
    }
    return sendResponse({ res, statusCode: 200, translationKey: "Marketing_deleted_successfully" });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: 500, translationKey: readableError.message, error });
  }
};
const getUserMarketings = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status, date } = req.query;
  try {
const userId = req.user._id;

    const { Marketings, meta } = await MarketingService.getUserMarketings({
      page,
      userId,
      limit,
      keyword,
      status,
      date,
      timezone: req.user?.timezone,
    });
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Marketings_fetched_successfully",
      data: Marketings,
      meta,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: 500, translationKey: readableError.message, error });
  }
};
module.exports = {
  createMarketing,
  getMarketings,
  getMarketingDetails,
  updateMarketing,
  getUserMarketings,
  deleteMarketing,
};
