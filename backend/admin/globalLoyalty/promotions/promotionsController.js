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

  let dateFields = {};
  let rawData = ["image", "title", "promotionType", "startDate", "endDate"];
  let objectIdFields = [];

  // ---------------- PROMOTION TYPE RULES ----------------

  // HAPPY HOUR
  if (req.body.promotionType === "globalHappyHourPromotion") {
    dateFields.startDate = "YYYY-MM-DD hh:mm A";
    dateFields.endDate = "YYYY-MM-DD hh:mm A";
    rawData.push("pointsMultiplier");
  }

  // CLAIM PROMOTION
  if (req.body.promotionType === "globalClaimPromotion") {
    dateFields.startDate = "YYYY-MM-DD";
    dateFields.endDate = "YYYY-MM-DD";
    rawData.push("reward", "claimPoints");
    objectIdFields.push("reward");
  }

  // ---------------- VALIDATION ----------------
  if (!validateParams(req, res, { rawData, dateFields, objectIdFields })) return;

  let recurringValidate = { rawData: [], dateFields: {} };

  if (recurringDetails?.isEnabled) {
    recurringValidate.rawData.push(
      "recurringDetails",
      "recurringDetails.frequency",
      "recurringDetails.interval",
      "recurringDetails.endType"
    );

    if (recurringDetails.endType === "onDate") {
      recurringValidate.dateFields["recurringDetails.endDate"] = "YYYY-MM-DD";
    }

    if (["weekly", "monthly"].includes(recurringDetails.frequency)) {
      recurringValidate.rawData.push("recurringDetails.daysOfWeek");
    }
  }

  if (!validateParams(req, res, recurringValidate)) return;

  try {
    // ---------------- DATE CONVERSION ----------------

    const fmt =
      req.body.promotionType === "globalHappyHourPromotion"
        ? "YYYY-MM-DD hh:mm A"
        : "YYYY-MM-DD";

    if (req.body.startDate) {
      req.body.startDate = convertTimezoneToUtc(
        req.body.startDate,
        timezone,
        fmt
      );
    }

    if (req.body.endDate) {
      req.body.endDate = convertTimezoneToUtc(
        req.body.endDate,
        timezone,
        fmt
      );
    }

    // ---------------- DATE VALIDATION ----------------
    if (
      req.body.startDate &&
      req.body.endDate &&
      new Date(req.body.endDate) < new Date(req.body.startDate)
    ) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "end_date_cannot_be_before_start_date",
      });
    }

    // ---------------- CREATE PROMOTION ----------------
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
