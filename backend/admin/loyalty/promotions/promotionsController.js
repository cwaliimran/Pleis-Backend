const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("@utils/responseUtil");

const service = require("./promotionsService");
const {
  preparePromotionTimesForStorage,
} = require("../../../commonModules/loyalty/promotions/utils/promotionSchedule");

const create = async (req, res) => {
  let { timezone } = req.user;
  let recurringDetails = req.body?.recurringDetails || {};
  const isRecurringEnabled = !!recurringDetails.isEnabled;
  if (!req.body.companyOrganizer) {
    req.body.companyOrganizer = req.user?._id;
  }


  var dateFields = {}
  var rawData = ["image", "title", "promotionType", "startDate", "endDate", "companyOrganizer"]
  var objectIdFields = ["companyOrganizer"]

  if (req.body.promotionType === "happyHour") {
    dateFields.startDate = "YYYY-MM-DD"
    dateFields.endDate = "YYYY-MM-DD"
    rawData.push("pointsMultiplier")
  }
  if (req.body.promotionType === "buyMenuItemPromotion") {
    dateFields.startDate = "YYYY-MM-DD"
    dateFields.endDate = "YYYY-MM-DD"
    rawData.push("menuItem", "extraPoints")
    objectIdFields.push("menuItem")
  }
    if (req.body.promotionType === "extraPointsForItem") {
      dateFields.startDate = "YYYY-MM-DD";
      dateFields.endDate = "YYYY-MM-DD";
      rawData.push("menuItem", "extraPoints");
      objectIdFields.push("menuItem");
    }
  if (req.body.promotionType === "productSale") {
    dateFields.startDate = "YYYY-MM-DD"
    dateFields.endDate = "YYYY-MM-DD"
    rawData.push("menuItem", "discountedPercent")
    objectIdFields.push("menuItem")
  }
  if (req.body.promotionType === "claimPromotion") {
    dateFields.startDate = "YYYY-MM-DD"
    dateFields.endDate = "YYYY-MM-DD"
    rawData.push("reward", "claimPoints")
    objectIdFields.push("reward")
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
    const times = preparePromotionTimesForStorage(
      req.body,
      req.user.timezone,
      convertTimezoneToUtc,
    );
    req.body.startTime = times.startTime;
    req.body.endTime = times.endTime;

    if (req.body.startDate) {
      req.body.startDate = convertTimezoneToUtc(
        req.body.startDate,
        req.user.timezone,
        "YYYY-MM-DD",
      );
    }
    if (req.body.endDate) {
      req.body.endDate = convertTimezoneToUtc(
        req.body.endDate,
        req.user.timezone,
        "YYYY-MM-DD",
      );
    }

    //end date cannot be before start date
    if (req.body.startDate && req.body.endDate && new Date(req.body.endDate) < new Date(req.body.startDate)) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "end_date_cannot_be_before_start_date",
      });
    }


    // 🔑 IMPORTANT: mark this promotion as a TEMPLATE on the server
    if (isRecurringEnabled) {
      req.body.recurringMeta = {
        isTemplate: true,
        parentPromotion: null,
        occurrenceIndex: 1,
      };
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
    const isTimePairError = /startTime and endTime/i.test(
      error?.message || readableError.message || "",
    );
    return sendResponse({
      res,
      statusCode: isTimePairError ? 400 : readableError.statusCode,
      translationKey: readableError.message,
      error,
    });
  }
};

const get = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let {
    keyword,
    status,
    startDate,
    endDate,
    companyOrganizer,
    sortBy,
    sortOrder,
    promotionType,
  } = req.query;
  const SORT_FIELDS = ["title", "description", "promotionType","status","views","favorites","participants","pointsAwarded"];
  const SORT_ORDERS = ["asc", "desc"];
  if ((sortBy && !SORT_FIELDS.includes(sortBy)) || (sortOrder && !SORT_ORDERS.includes(sortOrder))) {
    const key = sortBy && !SORT_FIELDS.includes(sortBy)
      ? "invalid_sort_by_field"
      : "invalid_sort_order";
    return sendResponse({ res, statusCode: 400, translationKey: key });
  }

  if ((sortBy && !sortOrder) || (!sortBy && sortOrder)) {
    const key = sortBy ? "sort_order_required_when_sort_by_is_provided"
      : "sort_by_required_when_sort_order_is_provided";
    return sendResponse({ res, statusCode: 400, translationKey: key });
  }
  if (!companyOrganizer) {
    companyOrganizer = req.user?._id;
  }
  try {
    //companyOrganizer is required to filter for specific company
    if (!companyOrganizer) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "company_organizer_is_required",
      });
    }

    const { responses, meta } = await service.get({
      companyOrganizer,
      page,
      limit,
      keyword,
      status,
      startDate,
      endDate,
      timezone: req.user?.timezone,
      sortBy,
      sortOrder,
      promotionType,
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
  const { scope = "single" } = req.query;
  const { timezone } = req.user;

  if (!validateParams(req, res, {
    pathParams: ["id"],
    objectIdFields: ["id"],
  })) return;

  const data = { ...req.body };

  try {
    // ----------------------------------
    // FETCH EXISTING (raw intent)
    // ----------------------------------
    const existing = await service.getDetails(req.params.id, timezone);
    if (!existing) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "promotion_not_found",
      });
    }

    const times = preparePromotionTimesForStorage(
      data,
      timezone,
      convertTimezoneToUtc,
    );
    if (data.startTime !== undefined || data.endTime !== undefined) {
      data.startTime = times.startTime;
      data.endTime = times.endTime;
    }

    // ----------------------------------
    // DATE VALIDATION + CONVERSION
    // ----------------------------------
    if (data.startDate || data.endDate) {
      let dateFields = {};

      if (data.startDate) dateFields.startDate = "YYYY-MM-DD";
      if (data.endDate) dateFields.endDate = "YYYY-MM-DD";

      if (!validateParams(req, res, { dateFields })) return;

      if (data.startDate) {
        data.startDate = convertTimezoneToUtc(
          data.startDate,
          timezone,
          "YYYY-MM-DD"
        );
      }

      if (data.endDate) {
        data.endDate = convertTimezoneToUtc(
          data.endDate,
          timezone,
          "YYYY-MM-DD"
        );
      }

      if (data.startDate && data.endDate && data.endDate < data.startDate) {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "end_date_cannot_be_before_start_date",
        });
      }
    }

    // ----------------------------------
    // RECURRING DETAILS (ADMIN ONLY)
    // ----------------------------------
    if (data.recurringDetails?.isEnabled) {
      // ❌ Never allow changing recurrence on a single occurrence
      if (scope === "single") {
        delete data.recurringDetails;
      } else {
        const rd = data.recurringDetails;

        let validateData = {
          rawData: [
            "recurringDetails.frequency",
            "recurringDetails.interval",
            "recurringDetails.endType",
          ],
          dateFields: {},
        };

        if (rd.endType === "onDate") {
          validateData.dateFields["recurringDetails.endDate"] = "YYYY-MM-DD";
        }

        if (["weekly", "monthly"].includes(rd.frequency)) {
          validateData.rawData.push("recurringDetails.daysOfWeek");
        }

        if (!validateParams(req, res, validateData)) return;
      }
    }

    // ----------------------------------
    // UPDATE WITH SCOPE
    // ----------------------------------
    const updated = await service.update(req.params.id, data, scope, timezone);

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "promotion_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "promotion_updated_successfully",
      data: updated,
    });

  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    const isTimePairError = /startTime and endTime/i.test(
      error?.message || readableError.message || "",
    );
    return sendResponse({
      res,
      statusCode: isTimePairError ? 400 : 500,
      translationKey: readableError.message,
      error,
    });
  }
};

const deleteItem = async (req, res) => {
  const { scope = "single" } = req.query; // single | future

  if (!validateParams(req, res, { pathParams: ["id"], objectIdFields: ["id"] })) return;
  try {
    const deleted = await service.deleteItem(req.params.id, scope);
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
