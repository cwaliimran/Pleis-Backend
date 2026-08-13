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
  dateFields.endDate = "YYYY-MM-DD"
if(!req.body.companyOrganizer){
  req.body.companyOrganizer = req.user._id
}
  var rawData = ["image", "title", "rewardType", "sortingType", "minPointsRequiredToClaim"]
  var objectIdFields = ["companyOrganizer"]

  if (req.body.rewardType === "ticketReward") {
    rawData.push("event")
    rawData.push("ticket")
    objectIdFields.push("event")
    objectIdFields.push("ticket")
  }
  if (req.body.rewardType === "buyMenuItemReward") {
    rawData.push("menuItem")
    objectIdFields.push("menuItem")
  }

  if (!validateParams(req, res, {
    rawData,
    dateFields,
    objectIdFields,
    enumFields: { "rewardType": ["buyMenuItemReward", "customReward", "ticketReward"] },
  })) return;

  if (req.body.endDate) {
    req.body.endDate = convertTimezoneToUtc(req.body.endDate, req.user.timezone, "YYYY-MM-DD");
  }

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
  let { keyword, status, date, companyOrganizer } = req.query;

  if (!companyOrganizer) {
    companyOrganizer = req.user._id;
  }

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
const getV2 = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, status, date, companyOrganizer, sortingType, sortBy, sortOrder } = req.query;

  if (!companyOrganizer) {
    companyOrganizer = req.user._id;
  }
    const SORT_FIELDS = ["title", "sortingType", "status", "views", "favoritesCount", "claimed", "redeemed", "conversion"];
    const SORT_ORDERS = ["asc", "desc"];
    if (
      (sortBy && !SORT_FIELDS.includes(sortBy)) ||
      (sortOrder && !SORT_ORDERS.includes(sortOrder))
    ) {
      const key =
        sortBy && !SORT_FIELDS.includes(sortBy)
          ? "invalid_sort_by_field"
          : "invalid_sort_order";
      return sendResponse({ res, statusCode: 400, translationKey: key });
    }

    if ((sortBy && !sortOrder) || (!sortBy && sortOrder)) {
      const key = sortBy
        ? "sort_order_required_when_sort_by_is_provided"
        : "sort_by_required_when_sort_order_is_provided";
      return sendResponse({ res, statusCode: 400, translationKey: key });
    }

  try {
    const { responses, meta } = await service.getV2({
      companyOrganizer,
      page,
      limit,
      keyword,
      status,
      date,
      timezone: req.user?.timezone,
      sortingType,
      sortBy,
      sortOrder,
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
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: readableError.message,
      error,
    });
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
const getAllTypes = async (req, res) => {
  try {
      const { page, limit } = parsePaginationParams(req);
      let {
        companyOrganizer,
      } = req.query;
      if (!companyOrganizer) {
        companyOrganizer = req.user._id;
      }
    const { responses, meta } = await service.getAllTypes({
      companyOrganizer,
      page,
      limit,
    });
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "reward_types_fetched_successfully",
      data: responses,
      meta,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: 500, translationKey: readableError.message, error });
  }
};


module.exports = {
  create,
  get,
  getDetails,
  update,
  deleteItem,
  getV2,
  getAllTypes,
};
