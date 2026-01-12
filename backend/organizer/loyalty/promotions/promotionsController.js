const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("@utils/responseUtil");

const service = require("./promotionsService");

const create = async (req, res) => {
  let { timezone } = req.user;
  let recurringDetails = req.body?.recurringDetails || {};

  var dateFields = {}
  req.body.companyOrganizer = req.user._id;
  var rawData = ["image", "title", "promotionType", "startDate", "endDate"]
  var objectIdFields = ["companyOrganizer"]

  if (req.body.promotionType === "happyHour") {
    dateFields.startDate = "YYYY-MM-DD hh:mm A"
    dateFields.endDate = "YYYY-MM-DD hh:mm A"
    rawData.push("pointsMultiplier")
  }
  if (req.body.promotionType === "buyMenuItemPromotion") {
    dateFields.startDate = "YYYY-MM-DD"
    dateFields.endDate = "YYYY-MM-DD"
    rawData.push("menuItem", "extraPoints")
    objectIdFields.push("menuItem")
  }
  if (req.body.promotionType === "productSale") {
    dateFields.startDate = "YYYY-MM-DD"
    dateFields.endDate = "YYYY-MM-DD"
    rawData.push("menuItem", "discountedPrice")
    objectIdFields.push("menuItem")
  }

  if (!validateParams(req, res, {
    rawData,
    dateFields,
    objectIdFields
  })) return;


  let validateData = {
    rawData: [],
    dateFields: {},
  };

  if (recurringDetails?.isEnabled) {

    validateData.rawData.push("recurringDetails");
    validateData.rawData.push("recurringDetails.frequency");
    validateData.rawData.push("recurringDetails.interval");
    validateData.rawData.push("recurringDetails.endType");

    // Conditional validation based on endType
    if (recurringDetails.endType === "onDate") {
      validateData.dateFields["recurringDetails.endDate"] = "YYYY-MM-DD";
    }

    // Validate daysOfWeek if frequency is weekly or monthly
    if (["weekly", "monthly"].includes(recurringDetails.frequency)) {
      validateData.rawData.push("recurringDetails.daysOfWeek");
    }
  }

  if (!validateParams(req, res, validateData)) return;


  try {

    if (req.body.promotionType === "happyHour") {
      //convert to utc
      if (req.body.startDate) {
        req.body.startDate = convertTimezoneToUtc(req.body.startDate, req.user.timezone, "YYYY-MM-DD hh:mm A");
      }
      if (req.body.endDate) {
        req.body.endDate = convertTimezoneToUtc(req.body.endDate, req.user.timezone, "YYYY-MM-DD hh:mm A");
      }
    } else {
      //convert to utc
      if (req.body.startDate) {
        req.body.startDate = convertTimezoneToUtc(req.body.startDate, req.user.timezone, "YYYY-MM-DD");
      }
      if (req.body.endDate) {
        req.body.endDate = convertTimezoneToUtc(req.body.endDate, req.user.timezone, "YYYY-MM-DD");
      }
    }


    //end date cannot be before start date
    if (req.body.startDate && req.body.endDate && new Date(req.body.endDate) < new Date(req.body.startDate)) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "end_date_cannot_be_before_start_date",
      });
    }
    const response = await service.create(req.body, timezone);
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "promotion_created_successfully",
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
  const { keyword, status, date } = req.query;

  try {

    const { responses, meta } = await service.get({
      companyOrganizer: req.user._id,
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
  let { timezone } = req.user;
  try {
    const response = await service.getDetails(req.params.id, timezone);
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

const update = async (req, res) => {
  if (!validateParams(req, res, { pathParams: ["id"], objectIdFields: ["id"] })) return;
  try {
    const updated = await service.update(req.params.id, req.body);
    if (!updated) {
      return sendResponse({ res, statusCode: 404, translationKey: "promotion_not_found" });
    }
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "promotion_updated_successfully",
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
      return sendResponse({ res, statusCode: 404, translationKey: "promotion_not_found" });
    }
    return sendResponse({ res, statusCode: 200, translationKey: "promotion_deleted_successfully" });
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
};
