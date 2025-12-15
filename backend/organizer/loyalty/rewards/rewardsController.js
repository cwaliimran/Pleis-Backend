const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("@utils/responseUtil");

const service = require("./rewardsService");

const create = async (req, res) => {

  var dateFields = {}
  var rawData = ["image", "title", "rewardType", "sortingType", "minPointsRequiredToClaim", "companyOrganizer",]
  var objectIdFields = ["companyOrganizer"]

  if (req.body.rewardType === "ticketReward") {
    rawData.push("event")
    objectIdFields.push("event")
  }
  if (req.body.rewardType === "buyMenuItemReward") {
    rawData.push("menuItem")
    objectIdFields.push("menuItem")
  }
  if (req.body.rewardType === "customReward") {
    rawData.push("customReward", "customReward.image", "customReward.title", "customReward.description")
  }

  if (!validateParams(req, res, {
    rawData,
    dateFields,
    objectIdFields,
    enumFields: { "rewardType": ["buyMenuItemReward", "customReward", "ticketReward"] },
  })) return;



  try {

    const response = await service.create(req.body);
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "reward_created_successfully",
      data: response,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode,
      translationKey: readableError.message,
      error,
    });
  }
};

const get = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status, date, companyOrganizer } = req.query;

  try {
    const { responses, meta } = await service.get({
      companyOrganizer,
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
      translationKey: "rewards_fetched_successfully",
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
  try {
    const response = await service.getDetails(req.params.id);
    if (!response) {
      return sendResponse({ res, statusCode: 404, translationKey: "reward_not_found" });
    }
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "reward_details_fetched_successfully",
      data: response,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: 500, translationKey: readableError.message, error });
  }
};

const update = async (req, res) => {
  if (!validateParams(req, res, { pathParams: ["id"], objectIdFields: ["id"] })) return;
  try {
    const updated = await service.update(req.params.id, req.body);
    if (!updated) {
      return sendResponse({ res, statusCode: 404, translationKey: "reward_not_found" });
    }
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "reward_updated_successfully",
      data: updated,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: 500, translationKey: readableError.message, error });
  }
};

const deleteItem = async (req, res) => {
  if (!validateParams(req, res, { pathParams: ["id"], objectIdFields: ["id"] })) return;
  try {
    const deleted = await service.deleteItem(req.params.id);
    if (!deleted) {
      return sendResponse({ res, statusCode: 404, translationKey: "reward_not_found" });
    }
    return sendResponse({ res, statusCode: 200, translationKey: "reward_deleted_successfully" });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: 500, translationKey: readableError.message, error });
  }
};

const redeemReward = async (req, res) => {
  try {
    const { bookingId } = req.body;
    if (!validateParams(req, res, { rawData: ["bookingId"] })) return;

    const userId = req.user._id;

    const result = await service.redeemReward(bookingId, userId);

    if (!result.success) {
      return sendResponse({
        res,
        statusCode: result.statusCode || 400,
        translationKey: result.translationKey || "reward_redeem_failed",
        data: result.data || null,
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: result.translationKey,
      data: result.data,
    });

  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: readableError.message,
      error,
    });
  }
};


module.exports = {
  redeemReward,
  create,
  get,
  getDetails,
  update,
  deleteItem,
};
